import { useState, useRef, useEffect, useMemo } from "react";
import { MapPin, Footprints, Move, Trash2, Undo, Redo, DoorOpen, Star, Settings2, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import mapImage from "@/assets/coliseum_grid_overlay.png";
import { toast } from "sonner";

type ToolType = "select" | "vendor" | "walkway" | "entry-exit" | "bin";

interface Node {
  id: string;
  x: number;
  y: number;
  type: "vendor" | "entry-exit" | "bin";
  label: string;
}

interface Path {
  id: string;
  points: { x: number; y: number }[];
  type: "walkway";
  label: string;
  capacity: number; // people per minute
}

interface MapState {
  nodes: Node[];
  paths: Path[];
}

interface PlanningParams {
  peoplePerHour: number;
  costPerBin: number;
  binCapacity: number;
  vendorSalesPerHour: number;
  maxBins: number;
  targetUtilization: number; // percentage
}

interface RecommendedBin {
  id: string;
  label: string;
  capacity: number;
  averageDistanceToVendors: number;
  nearestEntryDistance: number;
  walkwayDistance: number;
  capturePerHour: number;
  utilization: number;
}

interface OptimizationReport {
  totalVendors: number;
  totalEntries: number;
  totalBinsAvailable: number;
  binsNeeded: number;
  maxBinsAllowed: number;
  capacityDrivenBins: number;
  totalWastePerHour: number;
  estimatedCapturePerHour: number;
  captureRate: number;
  totalCost: number;
  walkwayLength: number;
  averageUtilization: number;
  targetUtilization: number;
  recommendedBins: RecommendedBin[];
  notes: string[];
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export const MapEditor = () => {
  const [tool, setTool] = useState<ToolType>("select");
  const [nodes, setNodes] = useState<Node[]>([]);
  const [paths, setPaths] = useState<Path[]>([]);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [drawingPath, setDrawingPath] = useState<{ x: number; y: number }[]>([]);
  const [planningParams, setPlanningParams] = useState<PlanningParams>({
    peoplePerHour: 300,
    costPerBin: 450,
    binCapacity: 120,
    vendorSalesPerHour: 60,
    maxBins: 3,
    targetUtilization: 80,
  });

  // History for undo/redo
  const [history, setHistory] = useState<MapState[]>([{ nodes: [], paths: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [report, setReport] = useState<OptimizationReport | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isAssistantThinking, setIsAssistantThinking] = useState(false);
  
  const canvasRef = useRef<HTMLDivElement>(null);
  const assistantTimerRef = useRef<number | null>(null);
  const pendingAssistantRef = useRef<{ question: string; report: OptimizationReport } | null>(null);
  const recommendedBinIds = useMemo(() => {
    if (!report) return new Set<string>();
    return new Set(report.recommendedBins.map((bin) => bin.id));
  }, [report]);

  const recommendedBinDetails = useMemo(() => {
    if (!report) return new Map<string, RecommendedBin>();
    return new Map(report.recommendedBins.map((bin) => [bin.id, bin]));
  }, [report]);

  useEffect(() => {
    if (!report) {
      setChatMessages([]);
      setChatInput("");
      if (assistantTimerRef.current) {
        window.clearTimeout(assistantTimerRef.current);
        assistantTimerRef.current = null;
      }
      pendingAssistantRef.current = null;
      setIsAssistantThinking(false);
    }
  }, [report]);

  useEffect(() => {
    return () => {
      if (assistantTimerRef.current) {
        window.clearTimeout(assistantTimerRef.current);
      }
      pendingAssistantRef.current = null;
    };
  }, []);

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

    if (tool === "vendor") {
      const newNode: Node = {
        id: `vendor-${Date.now()}`,
        x,
        y,
        type: "vendor",
        label: `Vendor ${nodes.filter(n => n.type === "vendor").length + 1}`,
      };
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      saveToHistory(newNodes, paths);
      toast.success("Vendor/source added");
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
    } else if (tool === "bin") {
      const newNode: Node = {
        id: `bin-${Date.now()}`,
        x,
        y,
        type: "bin",
        label: `Bin ${nodes.filter(n => n.type === "bin").length + 1}`,
      };
      const newNodes = [...nodes, newNode];
      setNodes(newNodes);
      saveToHistory(newNodes, paths);
      toast.success("Bin/collection point added");
    } else if (tool === "walkway") {
      setDrawingPath([...drawingPath, { x, y }]);
    }
  };

  const finishPath = () => {
    if (drawingPath.length >= 2) {
      const newPath: Path = {
        id: `path-${Date.now()}`,
        points: drawingPath,
        type: "walkway",
        label: `Walkway ${paths.length + 1}`,
        capacity: 50, // default capacity
      };
      const newPaths = [...paths, newPath];
      setPaths(newPaths);
      saveToHistory(nodes, newPaths);
      toast.success("Walkway created");
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
      case "vendor": return "hsl(var(--node-primary))";
      case "entry-exit": return "hsl(var(--node-entry))";
      case "bin": return "hsl(var(--node-poi))";
    }
  };

  const getPathColor = () => {
    return "hsl(var(--node-walkway))";
  };

  const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x - b.x, a.y - b.y);

  const computeAverageDistanceToVendors = (bin: Node, vendorNodes: Node[]) => {
    if (vendorNodes.length === 0) return 0;
    const total = vendorNodes.reduce((sum, vendor) => sum + distance(bin, vendor), 0);
    return total / vendorNodes.length;
  };

  const computeWalkwayLength = (pathList: Path[]) =>
    pathList.reduce((total, path) => {
      if (path.points.length < 2) return total;
      const length = path.points.slice(1).reduce((sum, point, index) => {
        const prev = path.points[index];
        return sum + distance(prev, point);
      }, 0);
      return total + length;
    }, 0);

  const distancePointToSegment = (
    px: number,
    py: number,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) {
      return Math.hypot(px - x1, py - y1);
    }
    const t = Math.max(
      0,
      Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy))
    );
    const closestX = x1 + t * dx;
    const closestY = y1 + t * dy;
    return Math.hypot(px - closestX, py - closestY);
  };

  const computeClosestWalkwayDistance = (node: Node, pathList: Path[]) => {
    if (pathList.length === 0) return Infinity;
    let minDistance = Infinity;
    pathList.forEach((path) => {
      if (path.points.length < 2) return;
      for (let i = 0; i < path.points.length - 1; i++) {
        const start = path.points[i];
        const end = path.points[i + 1];
        const dist = distancePointToSegment(node.x, node.y, start.x, start.y, end.x, end.y);
        if (dist < minDistance) {
          minDistance = dist;
        }
      }
    });
    return minDistance;
  };

  const computeNearestEntryDistance = (node: Node, entryNodes: Node[]) => {
    if (entryNodes.length === 0) return Infinity;
    return entryNodes.reduce((min, entry) => {
      const dist = distance(node, entry);
      return dist < min ? dist : min;
    }, Infinity);
  };

  const summarizeReportIntro = (result: OptimizationReport) => {
    const capturePercent = Math.round(result.captureRate * 100);
    const binCount = result.recommendedBins.length;
    const binsPhrase = binCount === 1 ? "bin" : "bins";
    return `I've analyzed the current layout and recommend ${binCount} ${binsPhrase} (budget allows ${result.maxBinsAllowed}), capturing roughly ${capturePercent}% of vendor waste for a total cost of $${result.totalCost.toFixed(
      2
    )} while targeting ${Math.round(result.targetUtilization * 100)}% utilization. Happy to explain any detail further.`;
  };

  const handleGenerateReport = () => {
    setIsGeneratingReport(true);
    try {
      const vendors = nodes.filter((node) => node.type === "vendor");
      const bins = nodes.filter((node) => node.type === "bin");
      const entries = nodes.filter((node) => node.type === "entry-exit");

      const walkwayLength = computeWalkwayLength(paths);
      const totalVendorSalesPerHour = vendors.length * planningParams.vendorSalesPerHour;
      const WASTE_PER_SALE = 0.08; // assumed waste production (kg or bags) per sale
      const totalWastePerHour = totalVendorSalesPerHour * WASTE_PER_SALE;

      const notes: string[] = [];
      if (vendors.length === 0) {
        notes.push("Add at least one vendor/source to estimate waste generation.");
      }
      if (bins.length === 0) {
        notes.push("Place one or more bin placeholders on the map to evaluate coverage.");
      }
      if (entries.length === 0) {
        notes.push("Entry/exit points help contextualize pedestrian distribution.");
      }
      if (paths.length === 0) {
        notes.push("Draw walkways to outline pedestrian flow for more realistic coverage.");
      }

      const vendorWeight = 0.5;
      const entryWeight = 0.3;
      const walkwayWeight = 0.2;

      const targetUtilizationRatio = Math.min(
        1,
        Math.max(0, planningParams.targetUtilization / 100)
      );
      notes.push(
        `Target utilization set to ${Math.round(targetUtilizationRatio * 100)}%.`
      );

      const candidateBins = bins
        .map((bin) => {
          const averageDistanceToVendors = computeAverageDistanceToVendors(bin, vendors);
          const nearestEntryDistance = computeNearestEntryDistance(bin, entries);
          const walkwayDistance = computeClosestWalkwayDistance(bin, paths);

          const vendorScore = vendors.length === 0 ? 0 : 1 / (1 + averageDistanceToVendors);
          const entryScore =
            entries.length === 0 || !Number.isFinite(nearestEntryDistance)
              ? 0
              : 1 / (1 + nearestEntryDistance);
          const walkwayScore =
            paths.length === 0 || !Number.isFinite(walkwayDistance)
              ? 0
              : 1 / (1 + walkwayDistance);

          const compositeScore =
            vendorWeight * vendorScore + entryWeight * entryScore + walkwayWeight * walkwayScore;

          const coverageScore = compositeScore * planningParams.binCapacity;

          return {
            bin,
            averageDistanceToVendors,
            nearestEntryDistance,
            walkwayDistance,
            coverageScore,
          };
        })
        .sort((a, b) => b.coverageScore - a.coverageScore);

      const capacityDrivenBins =
        totalWastePerHour === 0
          ? 0
          : Math.max(1, Math.ceil(totalWastePerHour / planningParams.binCapacity));

      if (candidateBins.length < planningParams.maxBins && bins.length > 0) {
        notes.push(
          "Add more bin candidates on the map if you want to deploy the full bin budget."
        );
      }

      const allocateWaste = (selectedList: typeof candidateBins) => {
        if (selectedList.length === 0) {
          return { captures: [] as number[], totalCaptured: 0 };
        }
        const capacity = planningParams.binCapacity;
        const scores = selectedList.map((item) => Math.max(item.coverageScore, 0.0001));
        const scoreSum = scores.reduce((sum, score) => sum + score, 0) || 1;
        const captures = selectedList.map((item, idx) => {
          const share = (scores[idx] / scoreSum) * totalWastePerHour;
          return Math.min(share, capacity);
        });
        let totalCaptured = captures.reduce((sum, value) => sum + value, 0);
        let remainingWaste = Math.max(0, totalWastePerHour - totalCaptured);
        if (remainingWaste > 0) {
          for (let i = 0; i < captures.length && remainingWaste > 0; i++) {
            const spare = capacity - captures[i];
            if (spare <= 0) continue;
            const added = Math.min(spare, remainingWaste);
            captures[i] += added;
            remainingWaste -= added;
          }
          totalCaptured = captures.reduce((sum, value) => sum + value, 0);
        }
        return { captures, totalCaptured };
      };

      const computeSelectionMetrics = (indices: number[]) => {
        if (indices.length === 0) {
          return {
            metrics: [] as (typeof candidateBins)[number][],
            totalCaptured: 0,
          };
        }
        const selectedList = indices.map((idx) => candidateBins[idx]);
        const allocation = allocateWaste(selectedList);
        const metrics = selectedList.map((item, idx) => ({
          ...item,
          capturePerHour: allocation.captures[idx] ?? 0,
          utilization:
            planningParams.binCapacity === 0
              ? 0
              : (allocation.captures[idx] ?? 0) / planningParams.binCapacity,
        }));
        return {
          metrics,
          totalCaptured: allocation.totalCaptured,
        };
      };

      let selectedIndices = candidateBins
        .slice(0, Math.min(candidateBins.length, planningParams.maxBins))
        .map((_, idx) => idx);
      let nextCandidateIndex = selectedIndices.length;
      const removalNotes: string[] = [];

      if (selectedIndices.length === 0 && candidateBins.length > 0) {
        selectedIndices = [0];
        nextCandidateIndex = Math.max(nextCandidateIndex, 1);
      }

      let selectionMetrics = computeSelectionMetrics(selectedIndices);
      let guard = 0;
      while (selectedIndices.length > 0 && guard < candidateBins.length * 3) {
        guard += 1;
        selectionMetrics = computeSelectionMetrics(selectedIndices);
        const failingIndex = selectionMetrics.metrics.findIndex(
          (metric) => metric.utilization < targetUtilizationRatio && selectedIndices.length > 1
        );

        if (failingIndex === -1) {
          if (
            selectedIndices.length === 1 &&
            selectionMetrics.metrics[0] &&
            selectionMetrics.metrics[0].utilization < targetUtilizationRatio &&
            nextCandidateIndex < candidateBins.length
          ) {
            selectedIndices[0] = nextCandidateIndex++;
            continue;
          }
          break;
        }

        if (nextCandidateIndex < candidateBins.length) {
          selectedIndices[failingIndex] = nextCandidateIndex++;
        } else {
          const removedMetric = selectionMetrics.metrics[failingIndex];
          removalNotes.push(
            `${removedMetric.bin.label} removed due to projected utilization ${Math.round(
              removedMetric.utilization * 100
            )}% below target (${Math.round(targetUtilizationRatio * 100)}%).`
          );
          selectedIndices.splice(failingIndex, 1);
          if (selectedIndices.length === 0 && candidateBins.length > 0) {
            selectedIndices.push(0);
            nextCandidateIndex = Math.max(nextCandidateIndex, 1);
          }
        }
      }

      selectionMetrics = computeSelectionMetrics(selectedIndices);

      if (selectionMetrics.metrics.length === 0 && candidateBins.length > 0) {
        selectedIndices = [0];
        selectionMetrics = computeSelectionMetrics(selectedIndices);
      }

      removalNotes.forEach((note) => notes.push(note));

      const underUtilized = selectionMetrics.metrics.filter(
        (metric) => metric.utilization < targetUtilizationRatio
      );
      if (underUtilized.length > 0) {
        underUtilized.forEach((metric) =>
          notes.push(
            `${metric.bin.label} is projected to run at ${Math.round(
              metric.utilization * 100
            )}% utilization (target ${Math.round(targetUtilizationRatio * 100)}%).`
          )
        );
      }

      const totalCost = selectedIndices.length * planningParams.costPerBin;
      const estimatedCapturePerHour = selectionMetrics.totalCaptured;
      const captureRate =
        totalWastePerHour === 0
          ? selectedIndices.length > 0
            ? 1
            : 0
          : estimatedCapturePerHour / totalWastePerHour;

      const averageUtilization =
        selectionMetrics.metrics.length === 0
          ? 0
          : selectionMetrics.metrics.reduce((sum, metric) => sum + metric.utilization, 0) /
            selectionMetrics.metrics.length;

      if (capacityDrivenBins > planningParams.maxBins) {
        notes.push(
          `Current bin budget (${planningParams.maxBins}) is below the ${capacityDrivenBins} bins required to capture all projected waste.`
        );
      }

      const maxAverageDistance = selectionMetrics.metrics.reduce(
        (max, item) => Math.max(max, item.averageDistanceToVendors),
        0
      );
      if (maxAverageDistance > 200) {
        notes.push(
          "Some bins are far from vendors; consider repositioning closer to reduce walking distance."
        );
      }

      const maxWalkwayDistance = selectionMetrics.metrics.reduce(
        (max, item) => Math.max(max, item.walkwayDistance),
        0
      );
      if (paths.length > 0 && maxWalkwayDistance > 120) {
        notes.push("Ensure recommended bins stay near walkways for easier access.");
      }

      const recommendedBins: RecommendedBin[] = selectionMetrics.metrics.map(
        ({
          bin,
          averageDistanceToVendors,
          nearestEntryDistance,
          walkwayDistance,
          capturePerHour,
          utilization,
        }) => ({
          id: bin.id,
          label: bin.label,
          capacity: planningParams.binCapacity,
          averageDistanceToVendors,
          nearestEntryDistance,
          walkwayDistance,
          capturePerHour,
          utilization,
        })
      );

      if (
        capacityDrivenBins > selectionMetrics.metrics.length &&
        candidateBins.length > selectionMetrics.metrics.length
      ) {
        notes.push(
          `Only ${selectionMetrics.metrics.length} bins meet the utilization target; add more candidates or adjust capacity to reach the projected need of ${capacityDrivenBins}.`
        );
      }

      if (totalWastePerHour > 0) {
        const capturePercent = Math.round(captureRate * 100);
        if (capturePercent < 100) {
          notes.push(`Projected capture covers ${capturePercent}% of hourly waste.`);
        }
      }

      const result: OptimizationReport = {
        totalVendors: vendors.length,
        totalEntries: entries.length,
        totalBinsAvailable: bins.length,
        binsNeeded: selectionMetrics.metrics.length,
        maxBinsAllowed: planningParams.maxBins,
        capacityDrivenBins,
        totalWastePerHour,
        estimatedCapturePerHour,
        captureRate,
        totalCost,
        walkwayLength,
        averageUtilization,
        targetUtilization: targetUtilizationRatio,
        recommendedBins,
        notes,
      };

      setReport(result);
      if (assistantTimerRef.current) {
        window.clearTimeout(assistantTimerRef.current);
        assistantTimerRef.current = null;
      }
      pendingAssistantRef.current = null;
      setIsAssistantThinking(false);
      setChatMessages([
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: summarizeReportIntro(result),
          timestamp: Date.now(),
        },
      ]);
      toast.success("Optimization report generated.");
      setChatInput("");
    } catch (error: any) {
      console.error(error);
      toast.error("Failed to generate optimization report.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const generateAssistantResponse = (question: string, result: OptimizationReport) => {
    const normalized = question.toLowerCase();
    const capturePercent = Math.round(result.captureRate * 100);
    const totalCost = `$${result.totalCost.toFixed(2)}`;
    const targetPercent = Math.round(result.targetUtilization * 100);
    const averageDistance =
      result.recommendedBins.length === 0
        ? 0
        : result.recommendedBins.reduce((sum, bin) => sum + bin.averageDistanceToVendors, 0) /
          result.recommendedBins.length;
    const distanceDescriptor = `${Math.round(averageDistance)} px average walking distance`;
    const averageWalkwayDistance =
      result.recommendedBins.length === 0
        ? 0
        : result.recommendedBins.reduce((sum, bin) => sum + bin.walkwayDistance, 0) /
          result.recommendedBins.length;
    const averageEntryDistance =
      result.recommendedBins.length === 0
        ? 0
        : result.recommendedBins.reduce((sum, bin) => sum + bin.nearestEntryDistance, 0) /
          result.recommendedBins.length;
    const walkwayDistanceDescriptor = Number.isFinite(averageWalkwayDistance)
      ? `${Math.round(averageWalkwayDistance)} px`
      : null;
    const entryDistanceDescriptor = Number.isFinite(averageEntryDistance)
      ? `${Math.round(averageEntryDistance)} px`
      : null;
    const averageUtilPercent = Math.round(result.averageUtilization * 100);

    const responses: string[] = [];

    if (normalized.includes("capture") || normalized.includes("waste")) {
      responses.push(
        `The projected capture rate is about ${capturePercent}% (${result.estimatedCapturePerHour.toFixed(
          2
        )} units of waste each hour) based on vendor output and bin capacity.`
      );
    }

    if (normalized.includes("cost") || normalized.includes("budget")) {
      responses.push(
        `Deploying the recommended bins would cost approximately ${totalCost} given the current cost-per-bin input.`
      );
    }

    if (normalized.includes("why") && normalized.includes("bin")) {
      responses.push(
        `We prioritized bins with the highest coverage score — capacity balanced against walking distance from vendors — which helps maximize capture before exceeding the hourly budget target.`
      );
    }

    if (normalized.includes("bin") && !normalized.includes("why")) {
      responses.push(
        `We're deploying ${result.binsNeeded} of the ${result.maxBinsAllowed} bins available, based on how well each location serves nearby vendors and entry points.`
      );
    }

    if (normalized.includes("distance") || normalized.includes("walk")) {
      if (result.recommendedBins.length > 0) {
        responses.push(
          `Visitors would walk roughly ${distanceDescriptor} to reach a recommended bin, keeping collection convenient.`
        );
      } else {
        responses.push("Add bin candidates to estimate walking distance to collection points.");
      }
    }

    if (normalized.includes("utilization") || normalized.includes("capacity")) {
      if (result.recommendedBins.length > 0) {
        responses.push(
          `Average utilization is about ${averageUtilPercent}% against the target of ${targetPercent}%.`
        );
      } else {
        responses.push("Add bin candidates to evaluate utilization against the target.");
      }
    }

    if (normalized.includes("target")) {
      responses.push(
        `The current analysis enforces a minimum utilization of ${targetPercent}% before recommending a bin.`
      );
    }

    if (result.recommendedBins.length > 0 && (normalized.includes("entry") || normalized.includes("exit"))) {
      if (entryDistanceDescriptor) {
        responses.push(
          `Recommended bins are positioned about ${entryDistanceDescriptor} from the nearest entry/exit, so foot traffic is intercepted where density is highest.`
        );
      } else {
        responses.push("Add entry/exit points to tailor bin placement to arrival hotspots.");
      }
    }

    if (result.recommendedBins.length > 0 && (normalized.includes("walkway") || normalized.includes("path"))) {
      if (walkwayDistanceDescriptor) {
        responses.push(
          `On average bins sit ${walkwayDistanceDescriptor} from the drawn walkways, keeping collection points anchored to pedestrian routes.`
        );
      } else {
        responses.push("Draw walkways to anchor bin placement along pedestrian routes.");
      }
    }

    if (normalized.includes("improve") || normalized.includes("increase") || normalized.includes("better")) {
      responses.push(
        `To improve capture, consider either adding more bin locations near heavy vendors or increasing the capacity per bin.`
      );
    }

    if (normalized.includes("budget") || normalized.includes("max")) {
      responses.push(
        `The plan respects the current bin budget of ${result.maxBinsAllowed}; the full waste load would call for about ${result.capacityDrivenBins} bins at the current capacity.`
      );
    }

    if (responses.length === 0) {
      responses.push(
        `The plan favors ${result.recommendedBins.length} bins to capture ${capturePercent}% of projected waste while keeping total costs near ${totalCost} and targeting ${targetPercent}% utilization. Let me know if you want to explore alternative scenarios.`
      );
    }

    if (result.notes.length > 0 && normalized.includes("note")) {
      responses.push(`Key design notes: ${result.notes.join(" ")}`);
    }

    return responses.join(" ");
  };

  const submitChat = () => {
    if (!report) return;
    const currentReport = report;
    const trimmed = chatInput.trim();
    if (!trimmed) return;

    if (assistantTimerRef.current && pendingAssistantRef.current) {
      window.clearTimeout(assistantTimerRef.current);
      assistantTimerRef.current = null;
      const pending = pendingAssistantRef.current;
      pendingAssistantRef.current = null;
      const immediateResponse: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: generateAssistantResponse(pending.question, pending.report),
        timestamp: Date.now(),
      };
      setChatMessages((prev) => [...prev, immediateResponse]);
      setIsAssistantThinking(false);
    }

    const timestamp = Date.now();
    const userMessage: ChatMessage = {
      id: `user-${timestamp}`,
      role: "user",
      content: trimmed,
      timestamp,
    };

    setChatMessages((prev) => [...prev, userMessage]);
    setChatInput("");
    setIsAssistantThinking(true);

    const responseDelay = 3000;
    pendingAssistantRef.current = { question: trimmed, report: currentReport };
    assistantTimerRef.current = window.setTimeout(() => {
      const pending = pendingAssistantRef.current;
      const timestampNow = Date.now();
      const assistantMessage: ChatMessage = {
        id: `assistant-${timestampNow}`,
        role: "assistant",
        content: pending
          ? generateAssistantResponse(pending.question, pending.report)
          : generateAssistantResponse(trimmed, currentReport),
        timestamp: timestampNow,
      };
      setChatMessages((prev) => [...prev, assistantMessage]);
      setIsAssistantThinking(false);
      assistantTimerRef.current = null;
      pendingAssistantRef.current = null;
    }, responseDelay);
  };

  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitChat();
  };

  const handleChatKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitChat();
    }
  };

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
            <TabsTrigger value="assistant">
              <MessageSquare className="h-4 w-4 mr-2" />
              Assistant
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
                    variant={tool === "vendor" ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setTool("vendor")}
                  >
                    <MapPin className="mr-2 h-4 w-4" />
                    Vendor / Source
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
                    variant={tool === "bin" ? "default" : "ghost"}
                    className="w-full justify-start"
                    onClick={() => setTool("bin")}
                  >
                    <Star className="mr-2 h-4 w-4" />
                    Bins / Collection
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
                  {drawingPath.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <p className="text-xs text-muted-foreground">
                        {drawingPath.length} point(s). Press Enter or use the button to confirm, Esc to cancel.
                      </p>
                      <Button
                        variant="default"
                        size="sm"
                        className="w-full"
                        onClick={finishPath}
                        disabled={drawingPath.length < 2}
                      >
                        Finish Walkway
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="text-sm font-medium mb-1 text-foreground flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Planning Inputs
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  Use these values to guide the optimization analysis.
                </p>
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Number of people per hour</Label>
                    <Input
                      type="number"
                      min="1"
                      value={planningParams.peoplePerHour}
                      onChange={(e) =>
                        setPlanningParams({
                          ...planningParams,
                          peoplePerHour: Math.max(0, parseInt(e.target.value, 10) || 0),
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Cost per bin</Label>
                    <Input
                      type="number"
                      min="0"
                      value={planningParams.costPerBin}
                      onChange={(e) =>
                        setPlanningParams({
                          ...planningParams,
                          costPerBin: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Bin capacity</Label>
                    <Input
                      type="number"
                      min="1"
                      value={planningParams.binCapacity}
                      onChange={(e) =>
                        setPlanningParams({
                          ...planningParams,
                          binCapacity: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Vendor output per hour</Label>
                    <Input
                      type="number"
                      min="0"
                      value={planningParams.vendorSalesPerHour}
                      onChange={(e) =>
                        setPlanningParams({
                          ...planningParams,
                          vendorSalesPerHour: Math.max(0, parseFloat(e.target.value) || 0),
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Max bins to deploy</Label>
                    <Input
                      type="number"
                      min="1"
                      value={planningParams.maxBins}
                      onChange={(e) =>
                        setPlanningParams({
                          ...planningParams,
                          maxBins: Math.max(1, parseInt(e.target.value, 10) || 1),
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Target bin utilization (%)</Label>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={planningParams.targetUtilization}
                      onChange={(e) =>
                        setPlanningParams({
                          ...planningParams,
                          targetUtilization: Math.min(
                            100,
                            Math.max(0, parseFloat(e.target.value) || 0)
                          ),
                        })
                      }
                      className="h-8 text-xs"
                    />
                  </div>
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
                          value={paths.find((p) => p.id === selectedPath)?.capacity || 50}
                          onChange={(e) =>
                            updatePathCapacity(selectedPath, parseInt(e.target.value, 10) || 50)
                          }
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

              <Separator />

              <div className="space-y-2">
                <Button onClick={handleGenerateReport} disabled={isGeneratingReport} className="w-full">
                  {isGeneratingReport
                    ? "Calculating..."
                    : report
                      ? "Recalculate Report"
                      : "Generate Report"}
                </Button>
                <p className="text-xs text-muted-foreground">
                  Place vendors, walkways, and candidate bins, then generate the optimization report.
                </p>
              </div>

              {report && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium text-foreground">Optimization Snapshot</h3>
                      <p className="text-xs text-muted-foreground">
                        Calculated from current map inputs.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Capture rate</span>
                        <span className="text-foreground font-semibold">
                          {Math.round(report.captureRate * 100)}%
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Bins recommended</span>
                        <span className="text-foreground font-semibold">
                          {report.binsNeeded} / {report.maxBinsAllowed}
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Average utilization</span>
                        <span className="text-foreground font-semibold">
                          {Math.round(report.averageUtilization * 100)}% (target {Math.round(report.targetUtilization * 100)}%)
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Total cost</span>
                        <span className="text-foreground font-semibold">
                          ${report.totalCost.toFixed(2)}
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Waste captured</span>
                        <span className="text-foreground font-semibold">
                          {report.estimatedCapturePerHour.toFixed(2)}
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Walkway length</span>
                        <span className="text-foreground font-semibold">
                          {Math.round(report.walkwayLength)} px
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Capacity need</span>
                        <span className="text-foreground font-semibold">
                          {report.capacityDrivenBins}
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Bins on map</span>
                        <span className="text-foreground font-semibold">
                          {report.totalBinsAvailable}
                        </span>
                      </div>
                      <div className="rounded border px-2 py-1">
                        <span className="block text-muted-foreground">Vendors assessed</span>
                        <span className="text-foreground font-semibold">{report.totalVendors}</span>
                      </div>
                    </div>
                    {report.notes.length > 0 && (
                      <div className="space-y-1">
                        <h4 className="text-xs font-semibold text-foreground">Notes</h4>
                        <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                          {report.notes.map((note, idx) => (
                            <li key={idx}>{note}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="assistant" className="flex-1 overflow-hidden">
            <div className="p-4 h-full flex flex-col gap-4">
              {report ? (
                <>
                  <div className="flex-1 overflow-y-auto space-y-3 rounded border bg-card/40 p-3">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`text-sm leading-relaxed ${
                          message.role === "assistant"
                            ? "text-foreground"
                            : "text-foreground/80"
                        }`}
                      >
                        <span className="block text-xs font-semibold text-muted-foreground">
                          {message.role === "assistant" ? "Assistant" : "You"}
                        </span>
                        <span>{message.content}</span>
                      </div>
                    ))}
                    {chatMessages.length === 0 && (
                      <p className="text-sm text-muted-foreground">
                        Ask about cost, capture rate, or how the bins were prioritized.
                      </p>
                    )}
                    {isAssistantThinking && (
                      <p className="text-xs text-muted-foreground italic">
                        Assistant is thinking...
                      </p>
                    )}
                  </div>
                  <form onSubmit={handleChatSubmit} className="space-y-2">
                    <Textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={handleChatKeyDown}
                      placeholder="Ask why a bin was selected, how to improve capture, etc."
                      rows={3}
                      className="resize-none"
                    />
                  </form>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground text-center">
                  Generate a report in the editor tab to unlock the assistant.
                </div>
              )}
            </div>
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
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {/* Draw paths */}
            {paths.map((path) => {
              const pathString = path.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
              return (
                <g key={path.id}>
                  <path
                    d={pathString}
                    stroke={getPathColor()}
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
                stroke={getPathColor()}
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
            const isRecommended = recommendedBinIds.has(node.id);
            const isSelected = selectedNode === node.id;
            const outlineClass = isSelected
              ? "outline outline-2 outline-primary/60"
              : isRecommended
                ? "outline outline-1 outline-accent/60"
                : "";
            const binDetails = recommendedBinDetails.get(node.id);
            return (
              <div
                key={node.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-move group"
                style={{
                  left: node.x,
                  top: node.y,
                  width: 12,
                  height: 12,
                }}
                onMouseDown={(e) => handleNodeMouseDown(node.id, e)}
              >
                <div
                  className={`w-full h-full rounded-full border border-white shadow ${outlineClass}`}
                  style={{ backgroundColor: getNodeColor(node.type) }}
                />
                <div className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap px-1.5 py-1 rounded bg-card/95 text-[10px] text-foreground shadow opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="font-semibold">{node.label}</span>
                  {binDetails && (
                    <span className="block text-[9px] text-muted-foreground/80">
                      {Math.round(binDetails.utilization * 100)}% util • {binDetails.capturePerHour.toFixed(1)} cap/hr
                    </span>
                  )}
                </div>
                {isRecommended && node.type === "bin" && (
                  <div className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 px-1.5 py-0.5 rounded bg-accent text-accent-foreground text-[10px] font-semibold shadow opacity-0 group-hover:opacity-100 transition-opacity">
                    Preferred
                  </div>
                )}
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
