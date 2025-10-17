import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Play, Pause, RotateCcw, BarChart3, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

interface SimulationControlsProps {
  isRunning: boolean;
  onStart: () => void;
  onPause: () => void;
  onReset: () => void;
  statistics: {
    stepCount: number;
    totalAgents: number;
    avgDistanceTraveled: string;
    maxCongestion: number;
    avgCongestion: string;
  };
  params: {
    numAgents: number;
    staticWeight: number;
    dynamicWeight: number;
    randomness: number;
    decayRate: number;
    diffusionRate: number;
  };
  onParamsChange: (params: any) => void;
  showTrails: boolean;
  showAgents: boolean;
  onShowTrailsChange: (show: boolean) => void;
  onShowAgentsChange: (show: boolean) => void;
}

export const SimulationControls = ({
  isRunning,
  onStart,
  onPause,
  onReset,
  statistics,
  params,
  onParamsChange,
  showTrails,
  showAgents,
  onShowTrailsChange,
  onShowAgentsChange,
}: SimulationControlsProps) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

  return (
    <Card className="p-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <Settings2 className="h-4 w-4" />
          Simulation Controls
        </h3>
        
        <div className="flex gap-2 mb-4">
          {!isRunning ? (
            <Button onClick={onStart} className="flex-1" size="sm">
              <Play className="h-4 w-4 mr-2" />
              Start
            </Button>
          ) : (
            <Button onClick={onPause} variant="secondary" className="flex-1" size="sm">
              <Pause className="h-4 w-4 mr-2" />
              Pause
            </Button>
          )}
          <Button onClick={onReset} variant="outline" size="sm">
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2 mb-4">
          <label className="flex items-center space-x-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={showAgents}
              onChange={(e) => onShowAgentsChange(e.target.checked)}
              className="rounded"
            />
            <span>Show Agents</span>
          </label>
          <label className="flex items-center space-x-2 cursor-pointer text-sm">
            <input
              type="checkbox"
              checked={showTrails}
              onChange={(e) => onShowTrailsChange(e.target.checked)}
              className="rounded"
            />
            <span>Show Trails</span>
          </label>
        </div>
      </div>

      <Separator />

      <div>
        <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Statistics
        </h3>
        <div className="space-y-1 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Step:</span>
            <Badge variant="secondary">{statistics.stepCount}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Agents:</span>
            <span className="font-medium">{statistics.totalAgents}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Distance:</span>
            <span className="font-medium">{statistics.avgDistanceTraveled}px</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Max Congestion:</span>
            <span className="font-medium">{statistics.maxCongestion}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Avg Congestion:</span>
            <span className="font-medium">{statistics.avgCongestion}</span>
          </div>
        </div>
      </div>

      <Separator />

      <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="w-full justify-between">
            <span className="text-sm font-medium">Parameters</span>
            <span className="text-xs">{isAdvancedOpen ? '▲' : '▼'}</span>
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-3 mt-3">
          <div>
            <Label className="text-xs">Number of Agents</Label>
            <Input
              type="number"
              min="1"
              max="500"
              value={params.numAgents}
              onChange={(e) => onParamsChange({ ...params, numAgents: parseInt(e.target.value) || 50 })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Static Weight (w_s)</Label>
            <Input
              type="number"
              step="0.1"
              value={params.staticWeight}
              onChange={(e) => onParamsChange({ ...params, staticWeight: parseFloat(e.target.value) || 1 })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Dynamic Weight (w_d)</Label>
            <Input
              type="number"
              step="0.1"
              value={params.dynamicWeight}
              onChange={(e) => onParamsChange({ ...params, dynamicWeight: parseFloat(e.target.value) || 0.5 })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Randomness (ε)</Label>
            <Input
              type="number"
              step="0.1"
              value={params.randomness}
              onChange={(e) => onParamsChange({ ...params, randomness: parseFloat(e.target.value) || 0.2 })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Decay Rate</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={params.decayRate}
              onChange={(e) => onParamsChange({ ...params, decayRate: parseFloat(e.target.value) || 0.95 })}
              className="h-8 text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Diffusion Rate</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={params.diffusionRate}
              onChange={(e) => onParamsChange({ ...params, diffusionRate: parseFloat(e.target.value) || 0.1 })}
              className="h-8 text-xs"
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
