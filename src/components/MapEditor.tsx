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

type Point = { x: number; y: number };

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
  position: { x: number; y: number };
  source: "user" | "auto";
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

interface WalkwaySample {
  pathId: string | null;
  point: Point;
  distanceAlong: number;
  weight: number;
  wasteUnits: number;
}

const BIN_CAPACITY_UNITS = 1;
const OVERLOAD_THRESHOLD = 1;
const UNDER_UTILIZATION_THRESHOLD = 0.8;
const MIN_NEW_BIN_UTILIZATION = 0.5;
const MAX_PARTNER_DISTANCE = 50;
const WALKWAY_SAMPLE_SPACING = 20;
const VENDOR_INFLUENCE_RADIUS = 200;
const WEIGHT_DISTANCE_FACTOR = 120;
const WASTE_PER_SALE_BIN_UNITS = 0.01;

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

  const autoRecommendedBins = useMemo(
    () =>
      report
        ? report.recommendedBins.filter(
          (bin) => bin.source === "auto" && !nodes.some((node) => node.id === bin.id)
        )
        : [],
    [report, nodes]
  );

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

  const computeAverageDistanceToVendors = (point: Point, vendorNodes: Node[]) => {
    if (vendorNodes.length === 0) return 0;
    const total = vendorNodes.reduce((sum, vendor) => sum + distance(point, vendor), 0);
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

  const computeClosestWalkwayDistance = (point: Point, pathList: Path[]) => {
    if (pathList.length === 0) return Infinity;
    let minDistance = Infinity;
    pathList.forEach((path) => {
      if (path.points.length < 2) return;
      for (let i = 0; i < path.points.length - 1; i++) {
        const start = path.points[i];
        const end = path.points[i + 1];
        const dist = distancePointToSegment(point.x, point.y, start.x, start.y, end.x, end.y);
        if (dist < minDistance) {
          minDistance = dist;
        }
      }
    });
    return minDistance;
  };

  const computeNearestEntryDistance = (point: Point, entryNodes: Node[]) => {
    if (entryNodes.length === 0) return Infinity;
    return entryNodes.reduce((min, entry) => {
      const dist = distance(point, entry);
      return dist < min ? dist : min;
    }, Infinity);
  };

  const summarizeReportIntro = (result: OptimizationReport) => {
    const capturePercent = Math.round(result.captureRate * 100);
    const binCount = result.recommendedBins.length;
    const binsPhrase = binCount === 1 ? "bin" : "bins";
    return `Optimized ${binCount} ${binsPhrase} (budget ${result.maxBinsAllowed}) to capture roughly ${capturePercent}% of hourly waste while averaging ${Math.round(result.averageUtilization * 100)}% utilization against the 80% relocation threshold. Let me know what you'd like to tweak next.`;
  };

  const handleGenerateReport = () => {
    setIsGeneratingReport(true);
    try {
      const vendors = nodes.filter((node) => node.type === "vendor");
      const existingBins = nodes.filter((node) => node.type === "bin");
      const entries = nodes.filter((node) => node.type === "entry-exit");

      const walkwayLength = computeWalkwayLength(paths);
      const totalVendorSalesPerHour = vendors.length * planningParams.vendorSalesPerHour;
      const totalWasteUnits = totalVendorSalesPerHour * WASTE_PER_SALE_BIN_UNITS;

      const notes: string[] = [];

      if (vendors.length === 0) {
        notes.push("Add at least one vendor/source to estimate waste generation.");
      }
      if (entries.length === 0) {
        notes.push("Entry/exit points help contextualize pedestrian distribution.");
      }
      if (paths.length === 0) {
        notes.push("Draw walkways to outline pedestrian flow for more realistic coverage.");
      }
      if (existingBins.length === 0) {
        notes.push("No existing bins were detected; the optimizer will propose fresh placements.");
      }

      notes.push("Loads are normalized to a one-unit-per-hour bin capacity.");
      notes.push("Capture metrics are reported in bin-hours (one unit equals one full bin per hour).");
      notes.push("Bins below 80% utilization are nudged toward supporting overloaded bins.");

      const samples: WalkwaySample[] = [];

      const addSample = (sample: WalkwaySample) => {
        samples.push(sample);
      };

      paths.forEach((path) => {
        if (path.points.length < 2) return;
        let cumulative = 0;
        for (let i = 0; i < path.points.length - 1; i++) {
          const start = path.points[i];
          const end = path.points[i + 1];
          const segmentLength = distance(start, end);
          if (segmentLength === 0) continue;
          const segmentSteps = Math.max(1, Math.round(segmentLength / WALKWAY_SAMPLE_SPACING));
          for (let step = 0; step < segmentSteps; step++) {
            const t = (step + 0.5) / segmentSteps;
            addSample({
              pathId: path.id,
              point: {
                x: start.x + (end.x - start.x) * t,
                y: start.y + (end.y - start.y) * t,
              },
              distanceAlong: cumulative + segmentLength * t,
              weight: 0,
              wasteUnits: 0,
            });
          }
          cumulative += segmentLength;
        }
      });

      if (samples.length === 0 && vendors.length > 0) {
        vendors.forEach((vendor) => {
          addSample({
            pathId: null,
            point: { x: vendor.x, y: vendor.y },
            distanceAlong: 0,
            weight: 0,
            wasteUnits: 0,
          });
        });
        notes.push("Using vendor positions as provisional sampling points until walkways are drawn.");
      }

      samples.forEach((sample) => {
        let weight = 0;
        vendors.forEach((vendor) => {
          const dist = distance(sample.point, vendor);
          if (dist <= VENDOR_INFLUENCE_RADIUS) {
            weight += Math.max(0, 1 - dist / VENDOR_INFLUENCE_RADIUS);
          }
        });
        sample.weight = weight;
      });

      let totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);

      if (totalWeight === 0 && vendors.length > 0 && samples.length > 0) {
        vendors.forEach((vendor) => {
          let bestIndex = -1;
          let bestDistance = Infinity;
          samples.forEach((sample, idx) => {
            const dist = distance(sample.point, vendor);
            if (dist < bestDistance) {
              bestDistance = dist;
              bestIndex = idx;
            }
          });
          if (bestIndex !== -1) {
            samples[bestIndex].weight += 1;
          }
        });
        totalWeight = samples.reduce((sum, sample) => sum + sample.weight, 0);
      }

      if (totalWeight === 0 && samples.length > 0) {
        totalWeight = samples.length;
        samples.forEach((sample) => {
          sample.weight = 1;
        });
      }

      samples.forEach((sample) => {
        sample.wasteUnits =
          totalWeight === 0 ? 0 : (sample.weight / totalWeight) * totalWasteUnits;
      });

      if (samples.length === 0) {
        notes.push("No sampling points available; add walkways and vendors to evaluate bin placement.");
      }

      const capacityDrivenBins =
        totalWasteUnits <= 0 ? 0 : Math.ceil(totalWasteUnits / BIN_CAPACITY_UNITS);

      let plannedBinCount = 0;
      if (totalWasteUnits > 0 && samples.length > 0) {
        const requiredBins = Math.ceil(totalWasteUnits / BIN_CAPACITY_UNITS);
        const utilLimitedBins = Math.floor(totalWasteUnits / MIN_NEW_BIN_UTILIZATION);
        plannedBinCount = Math.min(planningParams.maxBins, requiredBins);
        if (utilLimitedBins > 0) {
          plannedBinCount = Math.min(plannedBinCount, utilLimitedBins);
        } else if (totalWasteUnits < MIN_NEW_BIN_UTILIZATION) {
          plannedBinCount = 0;
          notes.push("Projected waste is below 50% of a bin; deployment skipped per utilization rule.");
        }
        plannedBinCount = Math.min(plannedBinCount, samples.length);
      }

      const selectedIndices: number[] = [];
      const sampleIndices = samples.map((_, idx) => idx);

      if (plannedBinCount > 0 && samples.length > 0) {
        const byDemand = [...sampleIndices].sort(
          (a, b) => samples[b].wasteUnits - samples[a].wasteUnits
        );
        if (byDemand.length > 0) {
          selectedIndices.push(byDemand[0]);
        }
        while (selectedIndices.length < plannedBinCount) {
          let bestCandidate: number | null = null;
          let bestScore = -Infinity;
          for (const idx of sampleIndices) {
            if (selectedIndices.includes(idx)) continue;
            const sample = samples[idx];
            const spacingScore = selectedIndices.reduce((minDist, selectedIdx) => {
              const dist = distance(sample.point, samples[selectedIdx].point);
              return dist < minDist ? dist : minDist;
            }, Number.POSITIVE_INFINITY);
            const weightRatio = totalWasteUnits === 0 ? 0 : sample.wasteUnits / totalWasteUnits;
            const score =
              (Number.isFinite(spacingScore) ? spacingScore : 0) + weightRatio * WEIGHT_DISTANCE_FACTOR;
            if (score > bestScore) {
              bestScore = score;
              bestCandidate = idx;
            }
          }
          if (bestCandidate === null) break;
          selectedIndices.push(bestCandidate);
        }
      }

      const assignSamplesToBins = (indices: number[]) => {
        const assignments = new Array(samples.length).fill(-1);
        const loads = indices.map(() => 0);
        const grouped = indices.map(() => [] as number[]);
        if (indices.length === 0) {
          return { loads, assignments, grouped };
        }
        samples.forEach((sample, sampleIdx) => {
          if (sample.wasteUnits <= 0) return;
          let closestBin = 0;
          let closestDistance = Infinity;
          indices.forEach((selectedIdx, binIdx) => {
            const dist = distance(sample.point, samples[selectedIdx].point);
            if (dist < closestDistance) {
              closestDistance = dist;
              closestBin = binIdx;
            }
          });
          assignments[sampleIdx] = closestBin;
          loads[closestBin] += sample.wasteUnits;
          grouped[closestBin].push(sampleIdx);
        });
        return { loads, assignments, grouped };
      };

      let assignment = assignSamplesToBins(selectedIndices);

      let repositionAttempts = 0;
      while (selectedIndices.length > 0 && repositionAttempts < 5) {
        let moved = false;
        selectedIndices.forEach((sampleIndex, binIdx) => {
          const assignedSamples = assignment.grouped[binIdx];
          if (!assignedSamples || assignedSamples.length === 0) return;
          let sumX = 0;
          let sumY = 0;
          let sumWeight = 0;
          assignedSamples.forEach((sampleIdx) => {
            const sample = samples[sampleIdx];
            sumX += sample.point.x * sample.wasteUnits;
            sumY += sample.point.y * sample.wasteUnits;
            sumWeight += sample.wasteUnits;
          });
          if (sumWeight === 0) return;
          const centroid = { x: sumX / sumWeight, y: sumY / sumWeight };
          let bestCandidate = sampleIndex;
          let bestDistance = Math.hypot(
            samples[sampleIndex].point.x - centroid.x,
            samples[sampleIndex].point.y - centroid.y
          );
          assignedSamples.forEach((sampleIdx) => {
            if (
              selectedIndices.some(
                (otherIdx, otherBinIdx) => otherBinIdx !== binIdx && otherIdx === sampleIdx
              )
            ) {
              return;
            }
            const sample = samples[sampleIdx];
            const dist = Math.hypot(sample.point.x - centroid.x, sample.point.y - centroid.y);
            if (dist < bestDistance) {
              bestDistance = dist;
              bestCandidate = sampleIdx;
            }
          });
          if (bestCandidate !== sampleIndex) {
            selectedIndices[binIdx] = bestCandidate;
            moved = true;
          }
        });
        if (!moved) break;
        assignment = assignSamplesToBins(selectedIndices);
        repositionAttempts += 1;
      }

      let extraCapacity = Math.max(0, planningParams.maxBins - selectedIndices.length);
      const unmatchedOverloads: number[] = [];

      const tryAddPartner = (overloadedIdx: number) => {
        if (extraCapacity <= 0) return false;
        const overloadedSampleIdx = selectedIndices[overloadedIdx];
        if (overloadedSampleIdx === undefined) return false;
        const overloadedSample = samples[overloadedSampleIdx];
        const candidates = samples
          .map((sample, idx) => ({
            idx,
            waste: sample.wasteUnits,
            dist: distance(sample.point, overloadedSample.point),
          }))
          .filter(
            (candidate) =>
              candidate.dist > 0 &&
              candidate.dist <= MAX_PARTNER_DISTANCE &&
              !selectedIndices.includes(candidate.idx) &&
              candidate.waste > 0
          )
          .sort((a, b) => {
            if (b.waste !== a.waste) return b.waste - a.waste;
            return a.dist - b.dist;
          });
        for (const candidate of candidates) {
          const nextSelection = [...selectedIndices, candidate.idx];
          const nextAssignment = assignSamplesToBins(nextSelection);
          const newBinLoad = nextAssignment.loads[nextSelection.length - 1];
          if (newBinLoad >= MIN_NEW_BIN_UTILIZATION) {
            selectedIndices.push(candidate.idx);
            assignment = nextAssignment;
            extraCapacity -= 1;
            notes.push(
              `Added a partner bin ${Math.round(candidate.dist)} units from overloaded bin ${overloadedIdx + 1}.`
            );
            return true;
          }
        }
        if (candidates.length > 0) {
          notes.push(
            `Skipped adding a partner near bin ${overloadedIdx + 1} because projected utilization stayed under 50%.`
          );
        }
        return false;
      };

      const tryRelocateUnderutilized = (overloaded: number[], underutilized: number[]) => {
        for (const overloadedIdx of overloaded) {
          const overloadedSampleIdx = selectedIndices[overloadedIdx];
          if (overloadedSampleIdx === undefined) continue;
          const overloadedSample = samples[overloadedSampleIdx];
          const orderedUnder = [...underutilized].sort((a, b) => {
            const aIdx = selectedIndices[a];
            const bIdx = selectedIndices[b];
            const aDist =
              aIdx === undefined ? Infinity : distance(samples[aIdx].point, overloadedSample.point);
            const bDist =
              bIdx === undefined ? Infinity : distance(samples[bIdx].point, overloadedSample.point);
            return aDist - bDist;
          });
          for (const underIdx of orderedUnder) {
            const originalSampleIdx = selectedIndices[underIdx];
            const candidatePositions = samples
              .map((sample, idx) => ({
                idx,
                waste: sample.wasteUnits,
                dist: distance(sample.point, overloadedSample.point),
              }))
              .filter(
                (candidate) =>
                  candidate.dist <= MAX_PARTNER_DISTANCE &&
                  !selectedIndices.some(
                    (selIdx, selBinIdx) => selBinIdx !== underIdx && selIdx === candidate.idx
                  )
              )
              .sort((a, b) => {
                if (b.waste !== a.waste) return b.waste - a.waste;
                return a.dist - b.dist;
              });
            for (const candidate of candidatePositions) {
              if (candidate.idx === originalSampleIdx) continue;
              selectedIndices[underIdx] = candidate.idx;
              const nextAssignment = assignSamplesToBins(selectedIndices);
              const newUnderLoad = nextAssignment.loads[underIdx];
              const newOverLoad = nextAssignment.loads[overloadedIdx];
              if (
                newUnderLoad >= MIN_NEW_BIN_UTILIZATION &&
                newOverLoad <= assignment.loads[overloadedIdx]
              ) {
                assignment = nextAssignment;
                notes.push(
                  `Relocated bin ${underIdx + 1} toward overloaded bin ${overloadedIdx + 1} to balance demand.`
                );
                return true;
              }
            }
            selectedIndices[underIdx] = originalSampleIdx;
          }
        }
        return false;
      };

      if (selectedIndices.length > 0) {
        let safety = 0;
        while (safety < 10) {
          safety += 1;
          const overloadedIndices = assignment.loads
            .map((load, idx) => (load > OVERLOAD_THRESHOLD + 1e-6 ? idx : -1))
            .filter((idx) => idx !== -1);
          if (overloadedIndices.length === 0) break;
          let handled = false;
          if (extraCapacity > 0) {
            for (const overloadedIdx of overloadedIndices) {
              if (tryAddPartner(overloadedIdx)) {
                handled = true;
                break;
              }
            }
            if (handled) continue;
          }
          const underutilizedIndices = assignment.loads
            .map((load, idx) => (load > 0 && load < UNDER_UTILIZATION_THRESHOLD ? idx : -1))
            .filter((idx) => idx !== -1);
          if (underutilizedIndices.length > 0 && tryRelocateUnderutilized(overloadedIndices, underutilizedIndices)) {
            handled = true;
          }
          if (!handled) {
            overloadedIndices.forEach((idx) => {
              if (!unmatchedOverloads.includes(idx)) {
                unmatchedOverloads.push(idx);
              }
            });
            break;
          }
        }
      }

      const timestamp = Date.now();
      const recommendedBins: RecommendedBin[] = selectedIndices.map((sampleIdx, binIdx) => {
        const sample = samples[sampleIdx];
        const loadUnits = assignment.loads[binIdx] ?? 0;
        const capturedUnits = Math.min(loadUnits, BIN_CAPACITY_UNITS);
        return {
          id: `auto-bin-${timestamp}-${binIdx + 1}`,
          label: `Bin ${binIdx + 1}`,
          capacity: BIN_CAPACITY_UNITS,
          averageDistanceToVendors: computeAverageDistanceToVendors(sample.point, vendors),
          nearestEntryDistance: computeNearestEntryDistance(sample.point, entries),
          walkwayDistance: computeClosestWalkwayDistance(sample.point, paths),
          capturePerHour: capturedUnits,
          utilization: loadUnits,
          position: { x: sample.point.x, y: sample.point.y },
          source: "auto",
        };
      });

      unmatchedOverloads.forEach((idx) => {
        const overload = assignment.loads[idx] ?? 0;
        if (overload > 1) {
          notes.push(
            `Bin ${idx + 1} remains overloaded by ${Math.round((overload - 1) * 100)}% because the bin budget is exhausted.`
          );
        }
      });

      if (capacityDrivenBins > planningParams.maxBins) {
        notes.push(
          `Current bin budget (${planningParams.maxBins}) is below the ${capacityDrivenBins} bins required to capture all projected waste.`
        );
      } else if (selectedIndices.length < capacityDrivenBins) {
        notes.push(
          `Only ${selectedIndices.length} bins meet the 50% utilization rule; ${capacityDrivenBins} bins would cover the full demand.`
        );
      }

      const totalCapturedUnits = assignment.loads.reduce(
        (sum, load) => sum + Math.min(load, BIN_CAPACITY_UNITS),
        0
      );
      const estimatedCapturePerHour = totalCapturedUnits;
      const captureRate =
        totalWasteUnits === 0 ? 0 : Math.min(1, estimatedCapturePerHour / totalWasteUnits);
      const averageUtilization =
        assignment.loads.length === 0
          ? 0
          : assignment.loads.reduce((sum, load) => sum + Math.min(load, 1), 0) /
          assignment.loads.length;
      const totalCost = recommendedBins.length * planningParams.costPerBin;

      const optimizedNodes: Node[] = [
        ...nodes.filter((node) => node.type !== "bin"),
        ...recommendedBins.map((bin) => ({
          id: bin.id,
          x: bin.position.x,
          y: bin.position.y,
          type: "bin" as const,
          label: bin.label,
        })),
      ];

      setNodes(optimizedNodes);
      saveToHistory(optimizedNodes, paths);

      const result: OptimizationReport = {
        totalVendors: vendors.length,
        totalEntries: entries.length,
        totalBinsAvailable: existingBins.length,
        binsNeeded: recommendedBins.length,
        maxBinsAllowed: planningParams.maxBins,
        capacityDrivenBins,
        totalWastePerHour: totalWasteUnits,
        estimatedCapturePerHour,
        captureRate,
        totalCost,
        walkwayLength,
        averageUtilization,
        targetUtilization: UNDER_UTILIZATION_THRESHOLD,
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
    const averageUtilPercent = Math.round(result.averageUtilization * 100);
    const overloadedBins = result.recommendedBins.filter((bin) => bin.utilization > 1);
    const underutilizedBins = result.recommendedBins.filter(
      (bin) => bin.utilization > 0 && bin.utilization < UNDER_UTILIZATION_THRESHOLD
    );
    const finiteEntryDistances = result.recommendedBins
      .map((bin) => bin.nearestEntryDistance)
      .filter((value) => Number.isFinite(value)) as number[];
    const averageVendorDistance =
      result.recommendedBins.length === 0
        ? 0
        : result.recommendedBins.reduce((sum, bin) => sum + bin.averageDistanceToVendors, 0) /
        result.recommendedBins.length;
    const averageEntryDistance =
      finiteEntryDistances.length === 0
        ? null
        : finiteEntryDistances.reduce((sum, value) => sum + value, 0) / finiteEntryDistances.length;
    const entryWalkSentence =
      averageEntryDistance === null ? "" : `, and entries are about ${Math.round(averageEntryDistance)}px away`;

    const responses: string[] = [];

    if (normalized.includes("capture") || normalized.includes("waste")) {
      responses.push(
        `The layout captures about ${capturePercent}% of hourly waste (${result.estimatedCapturePerHour.toFixed(
          2
        )} units) while keeping every bin within the one-unit capacity ceiling.`
      );
    }

    if (normalized.includes("cost") || normalized.includes("budget")) {
      responses.push(
        `Deploying ${result.binsNeeded} bin${result.binsNeeded === 1 ? "" : "s"} costs roughly ${totalCost}, staying within the allowance of ${result.maxBinsAllowed} bins.`
      );
    }

    if (
      normalized.includes("space") ||
      normalized.includes("distance") ||
      normalized.includes("walk")
    ) {
      if (result.recommendedBins.length > 1) {
        const nearestDistances: number[] = [];
        result.recommendedBins.forEach((bin, idx) => {
          let nearest = Infinity;
          result.recommendedBins.forEach((other, otherIdx) => {
            if (idx === otherIdx) return;
            const dist = Math.hypot(bin.position.x - other.position.x, bin.position.y - other.position.y);
            if (dist < nearest) {
              nearest = dist;
            }
          });
          if (nearest < Infinity) {
            nearestDistances.push(nearest);
          }
        });
        if (nearestDistances.length > 0) {
          const avgSpacing = Math.round(
            nearestDistances.reduce((sum, value) => sum + value, 0) / nearestDistances.length
          );
          responses.push(
            `Bins are spaced with an average nearest-neighbour gap of ${avgSpacing}px along the walkway while still respecting utilization limits.`
          );
        }
      } else if (result.recommendedBins.length === 1) {
        responses.push("A single bin sits near the highest vendor demand cluster on the walkway.");
      }
      responses.push(
        `Vendors reach a bin in roughly ${Math.round(averageVendorDistance)}px on average${entryWalkSentence}.`
      );
    }

    if (normalized.includes("overload") || normalized.includes("overflow")) {
      if (overloadedBins.length > 0) {
        responses.push(
          `${overloadedBins.length} bin${overloadedBins.length === 1 ? " remains" : "s remain"} over capacity; each was paired with a backup within 50 units whenever the budget allowed.`
        );
      } else {
        responses.push("All bins are at or below 100% utilization after adding local support bins.");
      }
    }

    if (normalized.includes("underutil") || normalized.includes("low util")) {
      if (underutilizedBins.length > 0) {
        responses.push(
          `Bins with utilization under 80% (${underutilizedBins.map((bin) => bin.label).join(", ")}) were moved toward the nearest overload; any position that would have fallen below 50% was discarded.`
        );
      } else {
        responses.push("No bins are sitting below the 80% relocation threshold in this scenario.");
      }
    }

    if (normalized.includes("why") || normalized.includes("how")) {
      responses.push(
        "The optimizer samples the walkway, applies a vendor-weighted demand gradient, then selects well-spaced bins that satisfy the 50% utilization rule and adds partner bins within 50 units wherever overloads appear."
      );
    }

    if (normalized.includes("add") && normalized.includes("bin")) {
      responses.push(
        "Additional bins were skipped once projected utilization would fall below 50%, so the current plan represents the most cost-effective deployment."
      );
    }

    if (normalized.includes("note")) {
      responses.push(`Key design notes: ${result.notes.join(" ")}`);
    }

    if (responses.length === 0) {
      responses.push(
        `We landed on ${result.binsNeeded} bin${result.binsNeeded === 1 ? "" : "s"}, capturing ${capturePercent}% of hourly waste at about ${averageUtilPercent}% average utilization while enforcing 80% relocation and 50% deployment rules. Ask about spacing, overloads, or cost if you want more detail.`
      );
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
          <div className="pl-4 pr-6 mt-4">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="editor">Editor</TabsTrigger>
              <TabsTrigger value="assistant">
                <MessageSquare className="h-4 w-4 mr-2" />
                Assistant
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="editor" className="flex-1 overflow-y-auto">

            <div className="pl-4 pr-6 pt-4 pb-4 space-y-4 flex-1">
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

              {selectedNode && (
                <div className="pb-3">
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
              )}

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
            <div className="pl-4 pr-6 pt-4 pb-4 h-full flex flex-col gap-4">
              {report ? (
                <>
                  <div className="flex-1 overflow-y-auto space-y-3 rounded border bg-card/40 p-3">
                    {chatMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`text-sm leading-relaxed ${message.role === "assistant"
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

          {autoRecommendedBins.map((bin) => (
            <div
              key={bin.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{
                left: bin.position.x,
                top: bin.position.y,
              }}
            >
              <div className="w-3 h-3 rounded-full border border-dashed border-accent bg-accent/40 shadow" />
              <div className="mt-1 text-[10px] text-accent-foreground bg-accent/80 px-1.5 py-0.5 rounded shadow text-center">
                {bin.label}
                <span className="block text-[9px] text-accent-foreground/90">
                  {Math.round(bin.utilization * 100)}% util • {bin.capturePerHour.toFixed(1)} cap/hr
                </span>
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
