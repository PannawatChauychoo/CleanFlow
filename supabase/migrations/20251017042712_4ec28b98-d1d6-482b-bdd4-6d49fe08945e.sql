-- Create projects table
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  original_image_url TEXT NOT NULL,
  grid_overlay_applied BOOLEAN NOT NULL DEFAULT false,
  grid_size INTEGER DEFAULT 20,
  map_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own projects" 
ON public.projects 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own projects" 
ON public.projects 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" 
ON public.projects 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" 
ON public.projects 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_projects_updated_at
BEFORE UPDATE ON public.projects
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for map images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('map-images', 'map-images', true)
ON CONFLICT (id) DO NOTHING;

-- Create policies for map image uploads
CREATE POLICY "Anyone can view map images" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'map-images');

CREATE POLICY "Users can upload their own map images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'map-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own map images" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'map-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete their own map images" 
ON storage.objects 
FOR DELETE 
USING (bucket_id = 'map-images' AND auth.uid()::text = (storage.foldername(name))[1]);