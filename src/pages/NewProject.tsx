import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, Upload, Grid3x3 } from "lucide-react";
import { toast } from "sonner";
import type { User } from "@supabase/supabase-js";

export default function NewProject() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [gridSize, setGridSize] = useState(20);
  const [showGrid, setShowGrid] = useState(false);
  const [loading, setLoading] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, session) => {
      setUser(session?.user ?? null);
      if (!session?.user) {
        navigate("/auth");
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    if (imagePreview && canvasRef.current) {
      drawGridOverlay();
    }
  }, [imagePreview, gridSize, showGrid]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const drawGridOverlay = () => {
    const canvas = canvasRef.current;
    const img = new Image();
    
    if (!canvas || !imagePreview) return;
    
    img.onload = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (showGrid) {
        ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
        ctx.lineWidth = 1;

        for (let x = 0; x <= canvas.width; x += gridSize) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, canvas.height);
          ctx.stroke();
        }

        for (let y = 0; y <= canvas.height; y += gridSize) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(canvas.width, y);
          ctx.stroke();
        }
      }
    };
    
    img.src = imagePreview;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!imageFile || !user) {
      toast.error("Please upload an image");
      return;
    }

    setLoading(true);

    try {
      const fileExt = imageFile.name.split(".").pop();
      const fileName = `${user.id}/${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from("map-images")
        .upload(fileName, imageFile);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from("map-images")
        .getPublicUrl(fileName);

      const { error: insertError } = await supabase.from("projects").insert({
        user_id: user.id,
        name,
        description: description || null,
        original_image_url: publicUrl,
        grid_overlay_applied: showGrid,
        grid_size: gridSize,
      });

      if (insertError) throw insertError;

      toast.success("Project created successfully!");
      navigate("/projects");
    } catch (error: any) {
      toast.error(error.message || "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <Button variant="ghost" onClick={() => navigate("/projects")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <h1 className="text-3xl font-bold mb-8">Create New Project</h1>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Project Name</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Downtown Traffic Analysis"
                />
              </div>

              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Analyzing pedestrian flow patterns in the city center..."
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="image">Upload Map Image</Label>
                <div className="mt-2">
                  <Input
                    id="image"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    required
                    className="cursor-pointer"
                  />
                </div>
              </div>

              {imagePreview && (
                <>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <Label>Grid Overlay</Label>
                      <Button
                        type="button"
                        variant={showGrid ? "default" : "outline"}
                        size="sm"
                        onClick={() => setShowGrid(!showGrid)}
                      >
                        <Grid3x3 className="mr-2 h-4 w-4" />
                        {showGrid ? "Hide Grid" : "Show Grid"}
                      </Button>
                    </div>

                    {showGrid && (
                      <div>
                        <Label htmlFor="gridSize">
                          Grid Size: {gridSize}px
                        </Label>
                        <input
                          id="gridSize"
                          type="range"
                          min="10"
                          max="100"
                          value={gridSize}
                          onChange={(e) => setGridSize(parseInt(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    )}
                  </div>

                  <div className="border rounded-lg overflow-hidden bg-muted">
                    <canvas
                      ref={canvasRef}
                      className="w-full h-auto"
                    />
                  </div>
                </>
              )}
            </div>
          </Card>

          <div className="flex gap-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/projects")}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !imageFile}>
              {loading ? "Creating..." : "Create Project"}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
}
