// Pedestrian Flow Simulation Engine
// Based on Burstedde et al. (2001) cellular automaton model

interface SimulationParams {
  gridSize: number;
  mapWidth: number;
  mapHeight: number;
  numAgents: number;
  staticWeight: number;  // w_s
  dynamicWeight: number; // w_d
  randomness: number;    // ε
  decayRate: number;
  diffusionRate: number;
}

interface Agent {
  id: string;
  x: number;
  y: number;
  targetNodeId: string;
  path: { x: number; y: number }[];
  distanceTraveled: number;
}

interface Node {
  id: string;
  x: number;
  y: number;
  type: "vendor" | "entry-exit" | "bin";
}

export class SimulationEngine {
  private params: SimulationParams;
  private agents: Agent[] = [];
  private staticField: number[][] = [];
  private dynamicField: number[][] = [];
  private obstacleMap: boolean[][] = [];
  private nodes: Node[] = [];
  private gridCols: number;
  private gridRows: number;
  private stepCount: number = 0;
  private congestionMap: number[][] = [];

  constructor(params: SimulationParams, nodes: Node[], obstacles?: boolean[][]) {
    this.params = params;
    this.nodes = nodes;
    this.gridCols = Math.ceil(params.mapWidth / params.gridSize);
    this.gridRows = Math.ceil(params.mapHeight / params.gridSize);
    
    this.initializeFields();
    if (obstacles) {
      this.obstacleMap = obstacles;
    } else {
      this.initializeObstacleMap();
    }
    this.computeStaticField();
    this.spawnAgents();
  }

  private initializeFields() {
    this.staticField = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(Infinity));
    this.dynamicField = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0));
    this.congestionMap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0));
  }

  private initializeObstacleMap() {
    // Default: all cells walkable
    this.obstacleMap = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(false));
  }

  private worldToGrid(x: number, y: number): { row: number; col: number } {
    return {
      col: Math.floor(x / this.params.gridSize),
      row: Math.floor(y / this.params.gridSize)
    };
  }

  private gridToWorld(row: number, col: number): { x: number; y: number } {
    return {
      x: (col + 0.5) * this.params.gridSize,
      y: (row + 0.5) * this.params.gridSize
    };
  }

  private computeStaticField() {
    // Use BFS to compute distance from each cell to nearest node
    const visited = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(false));
    const queue: { row: number; col: number; dist: number }[] = [];

    // Initialize with node positions
    this.nodes.forEach(node => {
      const { row, col } = this.worldToGrid(node.x, node.y);
      if (row >= 0 && row < this.gridRows && col >= 0 && col < this.gridCols) {
        this.staticField[row][col] = 0;
        queue.push({ row, col, dist: 0 });
        visited[row][col] = true;
      }
    });

    // BFS to propagate distances
    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = this.getNeighbors(current.row, current.col);

      neighbors.forEach(({ row, col }) => {
        if (!visited[row][col] && !this.obstacleMap[row][col]) {
          visited[row][col] = true;
          const newDist = current.dist + 1;
          this.staticField[row][col] = newDist;
          queue.push({ row, col, dist: newDist });
        }
      });
    }
  }

  private getNeighbors(row: number, col: number): { row: number; col: number }[] {
    // Moore neighborhood (8 neighbors)
    const neighbors: { row: number; col: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const newRow = row + dr;
        const newCol = col + dc;
        if (newRow >= 0 && newRow < this.gridRows && newCol >= 0 && newCol < this.gridCols) {
          neighbors.push({ row: newRow, col: newCol });
        }
      }
    }
    return neighbors;
  }

  private spawnAgents() {
    const entryNodes = this.nodes.filter(n => n.type === 'entry-exit');
    const targetNodes = this.nodes.filter(n => n.type === 'entry-exit' || n.type === 'bin');
    
    for (let i = 0; i < this.params.numAgents; i++) {
      // Random entry point
      const entryNode = entryNodes[Math.floor(Math.random() * entryNodes.length)];
      const targetNode = targetNodes[Math.floor(Math.random() * targetNodes.length)];
      
      if (entryNode && targetNode) {
        this.agents.push({
          id: `agent-${i}`,
          x: entryNode.x,
          y: entryNode.y,
          targetNodeId: targetNode.id,
          path: [],
          distanceTraveled: 0
        });
      }
    }
  }

  private calculateMoveProbability(row: number, col: number): number {
    const S = this.staticField[row][col];
    const D = this.dynamicField[row][col];
    const { staticWeight, dynamicWeight, randomness } = this.params;
    
    // P(i,j) ∝ exp(-w_s * S_ij + w_d * D_ij + ε)
    return Math.exp(-staticWeight * S + dynamicWeight * D + randomness * (Math.random() - 0.5));
  }

  private selectNextCell(currentRow: number, currentCol: number): { row: number; col: number } | null {
    const neighbors = this.getNeighbors(currentRow, currentCol);
    const probabilities: { row: number; col: number; prob: number }[] = [];
    
    let totalProb = 0;
    neighbors.forEach(neighbor => {
      if (!this.obstacleMap[neighbor.row][neighbor.col]) {
        const prob = this.calculateMoveProbability(neighbor.row, neighbor.col);
        probabilities.push({ ...neighbor, prob });
        totalProb += prob;
      }
    });

    if (totalProb === 0) return null;

    // Normalize and select
    const rand = Math.random() * totalProb;
    let cumulative = 0;
    for (const p of probabilities) {
      cumulative += p.prob;
      if (rand <= cumulative) {
        return { row: p.row, col: p.col };
      }
    }

    return probabilities[probabilities.length - 1] || null;
  }

  private updateDynamicField() {
    // Apply decay
    for (let r = 0; r < this.gridRows; r++) {
      for (let c = 0; c < this.gridCols; c++) {
        this.dynamicField[r][c] *= this.params.decayRate;
      }
    }

    // Apply diffusion (simple Gaussian-like smoothing)
    if (this.params.diffusionRate > 0) {
      const newField = Array(this.gridRows).fill(0).map(() => Array(this.gridCols).fill(0));
      
      for (let r = 0; r < this.gridRows; r++) {
        for (let c = 0; c < this.gridCols; c++) {
          let sum = this.dynamicField[r][c];
          let count = 1;
          
          const neighbors = this.getNeighbors(r, c);
          neighbors.forEach(({ row, col }) => {
            sum += this.dynamicField[row][col] * this.params.diffusionRate;
            count += this.params.diffusionRate;
          });
          
          newField[r][c] = sum / count;
        }
      }
      
      this.dynamicField = newField;
    }
  }

  public step() {
    this.stepCount++;
    
    // Move each agent
    this.agents.forEach(agent => {
      const { row, col } = this.worldToGrid(agent.x, agent.y);
      
      // Increment trail at current position
      if (row >= 0 && row < this.gridRows && col >= 0 && col < this.gridCols) {
        this.dynamicField[row][col] += 1;
        this.congestionMap[row][col]++;
      }
      
      // Select next cell
      const nextCell = this.selectNextCell(row, col);
      if (nextCell) {
        const newPos = this.gridToWorld(nextCell.row, nextCell.col);
        const dx = newPos.x - agent.x;
        const dy = newPos.y - agent.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        agent.x = newPos.x;
        agent.y = newPos.y;
        agent.distanceTraveled += dist;
        agent.path.push({ x: agent.x, y: agent.y });
      }
      
      // Check if reached target - assign new target
      const targetNode = this.nodes.find(n => n.id === agent.targetNodeId);
      if (targetNode) {
        const distToTarget = Math.sqrt(
          Math.pow(agent.x - targetNode.x, 2) + Math.pow(agent.y - targetNode.y, 2)
        );
        
        if (distToTarget < this.params.gridSize * 2) {
          // Reached target, assign new random target
        const newTargets = this.nodes.filter(n => 
            (n.type === 'entry-exit' || n.type === 'bin') && n.id !== agent.targetNodeId
          );
          if (newTargets.length > 0) {
            agent.targetNodeId = newTargets[Math.floor(Math.random() * newTargets.length)].id;
          }
        }
      }
    });

    // Update dynamic field (trails)
    this.updateDynamicField();
  }

  public getAgents(): Agent[] {
    return this.agents;
  }

  public getDynamicField(): number[][] {
    return this.dynamicField;
  }

  public getStaticField(): number[][] {
    return this.staticField;
  }

  public getCongestionMap(): number[][] {
    return this.congestionMap;
  }

  public getStatistics() {
    const avgDistance = this.agents.reduce((sum, a) => sum + a.distanceTraveled, 0) / this.agents.length;
    const maxCongestion = Math.max(...this.congestionMap.flat());
    const avgCongestion = this.congestionMap.flat().reduce((a, b) => a + b, 0) / (this.gridRows * this.gridCols);
    
    return {
      stepCount: this.stepCount,
      totalAgents: this.agents.length,
      avgDistanceTraveled: avgDistance.toFixed(2),
      maxCongestion: maxCongestion,
      avgCongestion: avgCongestion.toFixed(2)
    };
  }

  public reset() {
    this.stepCount = 0;
    this.agents = [];
    this.initializeFields();
    this.computeStaticField();
    this.spawnAgents();
  }
}
