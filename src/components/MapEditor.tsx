import { useState, useRef, useEffect } from "react";
import { MapPin, Route, Footprints, Move, Trash2, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import mapImage from "@/assets/coliseum_grid_overlay.png";
import { toast } from "sonner";

type ToolType = "select" | "node" | "street" | "walkway";

interface Node {
  id: string;
  x: number;
  y: number;
  type: "key-node" | "street" | "walkway";
  label: string;
}

interface Path {
  id: string;
  points: { x: number; y: number }[];
  type: "street" | "walkway";
  label: string;
}

export const MapEditor = () => {
  const [tool, setTool] = useState<ToolType>("select");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [paths, setPaths] = useState<Path[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [showNodes, setShowNodes] = useState(true);
  const [showStreets, setShowStreets] = useState(true);
  const [showWalkways, setShowWalkways] = useState(true);
  
  const canvasRef = useRef<HTMLDivElement>(null);

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
      setNodes([...nodes, newNode]);
      toast.success("Key node added");
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
      };
      setPaths([...paths, newPath]);
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
      setNodes(nodes.filter(n => n.id !== selectedNode));
      setSelectedNode(null);
      toast.success("Node deleted");
    }
  };

  const getNodeColor = (type: Node["type"]) => {
    switch (type) {
      case "key-node": return "hsl(var(--node-primary))";
      case "street": return "hsl(var(--node-street))";
      case "walkway": return "hsl(var(--node-walkway))";
    }
  };

  const getPathColor = (type: Path["type"]) => {
    return type === "street" ? "hsl(var(--node-street))" : "hsl(var(--node-walkway))";
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Delete" && selectedNode) {
        deleteSelected();
      } else if (e.key === "Escape") {
        setDrawingPath([]);
        setSelectedNode(null);
      } else if (e.key === "Enter" && drawingPath.length > 0) {
        finishPath();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNode, drawingPath]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Card className="w-64 rounded-none border-r flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-lg font-semibold text-foreground">Map Editor</h2>
          <p className="text-sm text-muted-foreground">Urban planning tools</p>
        </div>

        <div className="p-4 space-y-4 flex-1">
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
                <span className="text-sm">Key Nodes ({nodes.length})</span>
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
            {tool === "street" && "Drawing Streets"}
            {tool === "walkway" && "Drawing Walkways"}
          </Badge>
        </div>
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
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Draw paths */}
            {paths.map((path) => {
              if ((path.type === "street" && !showStreets) || (path.type === "walkway" && !showWalkways)) {
                return null;
              }
              
              const pathString = path.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              return (
                <path
                  key={path.id}
                  d={pathString}
                  stroke={getPathColor(path.type)}
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity="0.8"
                />
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
          {showNodes && nodes.map((node) => (
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
          ))}

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
