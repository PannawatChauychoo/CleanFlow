import { useState, useRef, useEffect } from "react";
import { MapPin, Route, Footprints, Move, Trash2, Layers, Undo, Redo, DoorOpen, Star, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import mapImage from "@/assets/coliseum_grid_overlay.png";
import { toast } from "sonner";
import { SimulationEngine } from "@/utils/simulationEngine";
import { SimulationCanvas } from "@/components/SimulationCanvas";
import { SimulationControls } from "@/components/SimulationControls";

type ToolType = "select" | "node" | "street" | "walkway" | "entry-exit" | "poi";

interface Node {
  id: string;
  x: number;
  y: number;
  type: "key-node" | "entry-exit" | "poi";
  label: string;
}

interface Path {
  id: string;
  points: { x: number; y: number }[];
  type: "street" | "walkway";
  label: string;
  capacity: number; // people per minute
}

interface MapState {
  nodes: Node[];
  paths: Path[];
}

export const MapEditor = () => {
  const [tool, setTool] = useState<ToolType>("select");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [paths, setPaths] = useState<Path[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [showNodes, setShowNodes] = useState(true);
  const [showStreets, setShowStreets] = useState(true);
  const [showWalkways, setShowWalkways] = useState(true);
  const [showEntryExit, setShowEntryExit] = useState(true);
  const [showPOI, setShowPOI] = useState(true);
  
  // History for undo/redo
  const [history, setHistory] = useState<MapState[]>([{ nodes: [], paths: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  // Simulation state
  const [simulation, setSimulation] = useState<SimulationEngine | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationAgents, setSimulationAgents] = useState<any[]>([]);
  const [trailField, setTrailField] = useState<number[][]>([]);
  const [statistics, setStatistics] = useState({
    stepCount: 0,
    totalAgents: 0,
    avgDistanceTraveled: "0",
    maxCongestion: 0,
    avgCongestion: "0"
  });
  const [showTrails, setShowTrails] = useState(true);
  const [showAgents, setShowAgents] = useState(true);
  const [simParams, setSimParams] = useState({
    numAgents: 100,
    staticWeight: 1.0,
    dynamicWeight: 0.5,
    randomness: 0.2,
    decayRate: 0.95,
    diffusionRate: 0.1
  });
  const simulationInterval = useRef<number | null>(null);
  
  const canvasRef = useRef<HTMLDivElement>(null);

  const saveToHistory = (newNodes: Node[], newPaths: Path[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push({ nodes: newNodes, paths: newPaths });
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  const undo = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex].nodes);
      setPaths(history[newIndex].paths);
      toast.success("Undone");
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setNodes(history[newIndex].nodes);
      setPaths(history[newIndex].paths);
      toast.success("Redone");
    }
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (tool === "node") {
      const newNode: Node = {
        id: `node-${Date.now()}`,
        x,
        y,
        type: "key-node",
        label: `Node ${nodes.length + 1}`,
      };
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      saveToHistory(newNodes, paths);
      toast.success("Key node added");
    } else if (tool === "entry-exit") {
      const newNode: Node = {
        id: `entry-${Date.now()}`,
        x,
        y,
        type: "entry-exit",
        label: `Entry/Exit ${nodes.filter(n => n.type === "entry-exit").length + 1}`,
      };
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      saveToHistory(newNodes, paths);
      toast.success("Entry/Exit point added");
    } else if (tool === "poi") {
      const newNode: Node = {
        id: `poi-${Date.now()}`,
        x,
        y,
        type: "poi",
        label: `POI ${nodes.filter(n => n.type === "poi").length + 1}`,
      };
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      saveToHistory(newNodes, paths);
      toast.success("Point of interest added");
    } else if (tool === "street" || tool === "walkway") {
      setDrawingPath([...drawingPath, { x, y }]);
    }
  };

  const finishPath = () => {
    if (drawingPath.length >= 2) {
      const newPath: Path = {
        id: `path-${Date.now()}`,
        points: drawingPath,
        type: tool === "street" ? "street" : "walkway",
        label: tool === "street" ? `Street ${paths.filter(p => p.type === "street").length + 1}` : `Walkway ${paths.filter(p => p.type === "walkway").length + 1}`,
        capacity: tool === "street" ? 100 : 50, // default capacity
      };
      const newPaths = [...paths, newPath];
      setPaths(newPaths);
      saveToHistory(nodes, newPaths);
      toast.success(`${tool === "street" ? "Street" : "Walkway"} created`);
    }
    setDrawingPath([]);
  };

  const handleNodeMouseDown = (nodeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (tool === "select") {
      setDraggingNode(nodeId);
      setSelectedNode(nodeId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingNode || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setNodes(nodes.map(node => 
      node.id === draggingNode ? { ...node, x, y } : node
    ));
  };

  const handleMouseUp = () => {
    setDraggingNode(null);
  };

  const deleteSelected = () => {
    if (selectedNode) {
      const newNodes = nodes.filter(n => n.id !== selectedNode);
      setNodes(newNodes);
      saveToHistory(newNodes, paths);
      setSelectedNode(null);
      toast.success("Node deleted");
    }
    if (selectedPath) {
      const newPaths = paths.filter(p => p.id !== selectedPath);
      setPaths(newPaths);
      saveToHistory(nodes, newPaths);
      setSelectedPath(null);
      toast.success("Path deleted");
    }
  };

  const updatePathCapacity = (pathId: string, capacity: number) => {
    const newPaths = paths.map(p => p.id === pathId ? { ...p, capacity } : p);
    setPaths(newPaths);
    saveToHistory(nodes, newPaths);
  };

  const getNodeColor = (type: Node["type"]) => {
    switch (type) {
      case "key-node": return "hsl(var(--node-primary))";
      case "entry-exit": return "hsl(var(--node-entry))";
      case "poi": return "hsl(var(--node-poi))";
    }
  };

  const getPathColor = (type: Path["type"]) => {
    return type === "street" ? "hsl(var(--node-street))" : "hsl(var(--node-walkway))";
  };

  // Simulation functions
  const startSimulation = () => {
    if (nodes.filter(n => n.type === 'entry-exit').length === 0) {
      toast.error("Add at least one entry/exit point to start simulation");
      return;
    }

    const mapWidth = canvasRef.current?.clientWidth || 800;
    const mapHeight = canvasRef.current?.clientHeight || 600;

    const sim = new SimulationEngine(
      {
        gridSize: 20,
        mapWidth,
        mapHeight,
        ...simParams
      },
      nodes
    );

    setSimulation(sim);
    setIsSimulating(true);
    setSimulationAgents(sim.getAgents());
    setTrailField(sim.getDynamicField());
    setStatistics(sim.getStatistics());
    toast.success("Simulation started");

    simulationInterval.current = window.setInterval(() => {
      sim.step();
      setSimulationAgents([...sim.getAgents()]);
      setTrailField([...sim.getDynamicField()]);
      setStatistics(sim.getStatistics());
    }, 100);
  };

  const pauseSimulation = () => {
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
    }
    setIsSimulating(false);
    toast.info("Simulation paused");
  };

  const resetSimulation = () => {
    if (simulationInterval.current) {
      clearInterval(simulationInterval.current);
      simulationInterval.current = null;
    }
    setIsSimulating(false);
    setSimulation(null);
    setSimulationAgents([]);
    setTrailField([]);
    setStatistics({
      stepCount: 0,
      totalAgents: 0,
      avgDistanceTraveled: "0",
      maxCongestion: 0,
      avgCongestion: "0"
    });
    toast.info("Simulation reset");
  };

  useEffect(() => {
    return () => {
      if (simulationInterval.current) {
        clearInterval(simulationInterval.current);
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && (selectedNode || selectedPath)) {
        deleteSelected();
      } else if (e.key === "Escape") {
        setDrawingPath([]);
        setSelectedNode(null);
        setSelectedPath(null);
      } else if (e.key === "Enter" && drawingPath.length > 0) {
        finishPath();
      } else if (e.ctrlKey && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && (e.key === "y" || (e.shiftKey && e.key === "z"))) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, selectedPath, drawingPath, historyIndex, history]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Card className="w-80 rounded-none border-r flex flex-col overflow-y-auto">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Map Editor</h2>
          <p className="text-sm text-muted-foreground">Urban planning tools</p>
        </div>

        <Tabs defaultValue="editor" className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-2 mx-4 mt-4">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="simulation">
              <Activity className="h-4 w-4 mr-2" />
              Simulation
            </TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="flex-1 overflow-y-auto">

        <div className="p-4 space-y-4 flex-1">
          <div>
            <div className="flex gap-1 mb-2">
              <Button
                variant="outline"
                size="sm"
                onClick={undo}
                disabled={historyIndex === 0}
                className="flex-1"
              >
                <Undo className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={redo}
                disabled={historyIndex === history.length - 1}
                className="flex-1"
              >
                <Redo className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-2 text-foreground">Tools</h3>
            <div className="space-y-1">
              <Button
                variant={tool === "select" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setTool("select")}
              >
                <Move className="mr-2 h-4 w-4" />
                Select & Move
              </Button>
              <Button
                variant={tool === "node" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setTool("node")}
              >
                <MapPin className="mr-2 h-4 w-4" />
                Add Key Node
              </Button>
              <Button
                variant={tool === "entry-exit" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setTool("entry-exit")}
              >
                <DoorOpen className="mr-2 h-4 w-4" />
                Entry/Exit Point
              </Button>
              <Button
                variant={tool === "poi" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => setTool("poi")}
              >
                <Star className="mr-2 h-4 w-4" />
                Point of Interest
              </Button>
              <Button
                variant={tool === "street" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => {
                  setTool("street");
                  setDrawingPath([]);
                }}
              >
                <Route className="mr-2 h-4 w-4" />
                Draw Street
              </Button>
              <Button
                variant={tool === "walkway" ? "default" : "ghost"}
                className="w-full justify-start"
                onClick={() => {
                  setTool("walkway");
                  setDrawingPath([]);
                }}
              >
                <Footprints className="mr-2 h-4 w-4" />
                Draw Walkway
              </Button>
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-sm font-medium mb-2 text-foreground flex items-center">
              <Layers className="mr-2 h-4 w-4" />
              Layers
            </h3>
            <div className="space-y-2">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showNodes}
                  onChange={(e) => setShowNodes(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Key Nodes ({nodes.filter(n => n.type === "key-node").length})</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showEntryExit}
                  onChange={(e) => setShowEntryExit(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Entry/Exit ({nodes.filter(n => n.type === "entry-exit").length})</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showPOI}
                  onChange={(e) => setShowPOI(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">POIs ({nodes.filter(n => n.type === "poi").length})</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showStreets}
                  onChange={(e) => setShowStreets(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Streets ({paths.filter(p => p.type === "street").length})</span>
              </label>
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showWalkways}
                  onChange={(e) => setShowWalkways(e.target.checked)}
                  className="rounded"
                />
                <span className="text-sm">Walkways ({paths.filter(p => p.type === "walkway").length})</span>
              </label>
            </div>
          </div>

          {selectedNode && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2 text-foreground">Selected Node</h3>
                <Button
                  variant="destructive"
                  size="sm"
                  className="w-full"
                  onClick={deleteSelected}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete Node
                </Button>
              </div>
            </>
          )}

          {selectedPath && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2 text-foreground">Selected Path</h3>
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">Capacity (people/min)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={paths.find(p => p.id === selectedPath)?.capacity || 50}
                      onChange={(e) => updatePathCapacity(selectedPath, parseInt(e.target.value) || 50)}
                      className="h-8"
                    />
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="w-full"
                    onClick={deleteSelected}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete Path
                  </Button>
                </div>
              </div>
            </>
          )}

          {drawingPath.length > 0 && (
            <>
              <Separator />
              <div>
                <h3 className="text-sm font-medium mb-2 text-foreground">Drawing</h3>
                <p className="text-xs text-muted-foreground mb-2">
                  {drawingPath.length} point(s). Press Enter to finish or Esc to cancel.
                </p>
                <Button
                  variant="default"
                  size="sm"
                  className="w-full"
                  onClick={finishPath}
                  disabled={drawingPath.length < 2}
                >
                  Finish Path
                </Button>
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t">
          <Badge variant="secondary" className="w-full justify-center">
            {tool === "select" && "Select Mode"}
            {tool === "node" && "Adding Nodes"}
            {tool === "entry-exit" && "Adding Entry/Exit"}
            {tool === "poi" && "Adding POI"}
            {tool === "street" && "Drawing Streets"}
            {tool === "walkway" && "Drawing Walkways"}
          </Badge>
        </div>
          </TabsContent>

          <TabsContent value="simulation" className="p-4">
            <SimulationControls
              isRunning={isSimulating}
              onStart={startSimulation}
              onPause={pauseSimulation}
              onReset={resetSimulation}
              statistics={statistics}
              params={simParams}
              onParamsChange={setSimParams}
              showTrails={showTrails}
              showAgents={showAgents}
              onShowTrailsChange={setShowTrails}
              onShowAgentsChange={setShowAgents}
            />
          </TabsContent>
        </Tabs>
      </Card>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-canvas-bg">
        <div
          ref={canvasRef}
          className="relative w-full h-full cursor-crosshair"
          onClick={handleCanvasClick}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          style={{
            backgroundImage: `url(${mapImage})`,
            backgroundSize: "contain",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Simulation overlay */}
          {simulation && (
            <SimulationCanvas
              agents={simulationAgents}
              trailField={trailField}
              gridSize={20}
              width={canvasRef.current?.clientWidth || 800}
              height={canvasRef.current?.clientHeight || 600}
              showTrails={showTrails}
              showAgents={showAgents}
            />
          )}

          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Draw paths */}
            {paths.map((path) => {
              if ((path.type === "street" && !showStreets) || (path.type === "walkway" && !showWalkways)) {
                return null;
              }
              
              const pathString = path.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              return (
                <g key={path.id}>
                  <path
                    d={pathString}
                    stroke={getPathColor(path.type)}
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity="0.8"
                  />
                  <path
                    d={pathString}
                    stroke="transparent"
                    strokeWidth="15"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ cursor: tool === "select" ? "pointer" : "inherit", pointerEvents: "stroke" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (tool === "select") {
                        setSelectedPath(path.id);
                        setSelectedNode(null);
                      }
                    }}
                    className={selectedPath === path.id ? "stroke-primary/20" : ""}
                  />
                </g>
              );
            })}

            {/* Draw current path being drawn */}
            {drawingPath.length > 0 && (
              <path
                d={drawingPath.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                stroke={tool === "street" ? getPathColor("street") : getPathColor("walkway")}
                strokeWidth="3"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
                strokeDasharray="5,5"
              />
            )}
          </svg>

          {/* Draw nodes */}
          {nodes.map((node) => {
            if ((node.type === "key-node" && !showNodes) ||
                (node.type === "entry-exit" && !showEntryExit) ||
                (node.type === "poi" && !showPOI)) {
              return null;
            }
            return (
            <div
              key={node.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-move transition-transform hover:scale-110"
              style={{
                left: node.x,
                top: node.y,
              }}
              onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
            >
              <div
                className={`w-6 h-6 rounded-full border-2 border-white shadow-lg ${
                  selectedNode === node.id ? 'ring-4 ring-primary/50' : ''
                }`}
                style={{ backgroundColor: getNodeColor(node.type) }}
              />
              <div className="absolute top-8 left-1/2 -translate-x-1/2 whitespace-nowrap bg-card/90 backdrop-blur-sm px-2 py-1 rounded text-xs shadow-md">
                {node.label}
              </div>
            </div>
          );
          })}

          {/* Draw points for current path */}
          {drawingPath.map((point, i) => (
            <div
              key={i}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ left: point.x, top: point.y }}
            >
              <div className="w-3 h-3 rounded-full bg-white border-2 border-primary shadow-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
