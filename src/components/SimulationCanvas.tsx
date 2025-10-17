import { useEffect, useRef } from "react";

interface Agent {
  id: string;
  x: number;
  y: number;
  targetNodeId: string;
  path: { x: number; y: number }[];
}

interface SimulationCanvasProps {
  agents: Agent[];
  trailField: number[][];
  gridSize: number;
  width: number;
  height: number;
  showTrails: boolean;
  showAgents: boolean;
}

export const SimulationCanvas = ({
  agents,
  trailField,
  gridSize,
  width,
  height,
  showTrails,
  showAgents
}: SimulationCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw trail heatmap
    if (showTrails && trailField.length > 0) {
      const maxTrail = Math.max(...trailField.flat());
      
      for (let r = 0; r < trailField.length; r++) {
        for (let c = 0; c < trailField[r].length; c++) {
          const intensity = trailField[r][c] / (maxTrail || 1);
          if (intensity > 0.01) {
            const alpha = Math.min(intensity, 0.7);
            ctx.fillStyle = `rgba(255, 100, 0, ${alpha})`;
            ctx.fillRect(
              c * gridSize,
              r * gridSize,
              gridSize,
              gridSize
            );
          }
        }
      }
    }

    // Draw agents
    if (showAgents) {
      agents.forEach(agent => {
        ctx.beginPath();
        ctx.arc(agent.x, agent.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = 'hsl(210, 100%, 50%)';
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [agents, trailField, gridSize, width, height, showTrails, showAgents]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ mixBlendMode: 'multiply' }}
    />
  );
};
