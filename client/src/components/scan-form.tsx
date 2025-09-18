import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Scan, AlertCircle, CheckCircle } from "lucide-react";

const scanFormSchema = z.object({
  businessName: z.string().min(1, "Business name is required"),
  website: z.string().url("Please enter a valid URL").optional().or(z.literal("")),
});

type ScanFormData = z.infer<typeof scanFormSchema>;

export default function ScanForm() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ScanFormData>({
    resolver: zodResolver(scanFormSchema),
    defaultValues: {
      businessName: "",
      website: "",
    },
  });

  const scanMutation = useMutation({
    mutationFn: async (data: ScanFormData) => {
      const response = await apiRequest("POST", "/api/scan", data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Scan Initiated",
        description: `Business scan for "${data.scanId}" has been started successfully.`,
      });
      reset();
      queryClient.invalidateQueries({ queryKey: ["/api/results"] });
    },
    onError: (error) => {
      toast({
        variant: "destructive",
        title: "Scan Failed",
        description: error.message || "Failed to initiate business scan. Please try again.",
      });
    },
  });

  const onSubmit = (data: ScanFormData) => {
    scanMutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="space-y-4">
        <div>
          <Label htmlFor="businessName" className="text-foreground font-medium">
            Business Name *
          </Label>
          <Input
            id="businessName"
            type="text"
            placeholder="Enter business name to scan"
            className="mt-1"
            data-testid="input-business-name"
            {...register("businessName")}
          />
          {errors.businessName && (
            <div className="flex items-center mt-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mr-1" />
              {errors.businessName.message}
            </div>
          )}
        </div>

        <div>
          <Label htmlFor="website" className="text-foreground font-medium">
            Website URL (Optional)
          </Label>
          <Input
            id="website"
            type="url"
            placeholder="https://example.com"
            className="mt-1"
            data-testid="input-website"
            {...register("website")}
          />
          {errors.website && (
            <div className="flex items-center mt-2 text-destructive text-sm">
              <AlertCircle className="w-4 h-4 mr-1" />
              {errors.website.message}
            </div>
          )}
        </div>
      </div>

      <Card className="bg-muted/50 border-border">
        <CardContent className="p-4">
          <div className="flex items-center text-sm text-muted-foreground">
            <Scan className="w-4 h-4 mr-2" />
            Our scanner will analyze the business structure, online presence, and provide actionable insights.
          </div>
        </CardContent>
      </Card>

      <Button
        type="submit"
        className="w-full"
        disabled={scanMutation.isPending}
        data-testid="button-start-scan"
      >
        {scanMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            Initiating Scan...
          </>
        ) : (
          <>
            <Scan className="w-4 h-4 mr-2" />
            Start Business Scan
          </>
        )}
      </Button>

      {scanMutation.isSuccess && (
        <div className="flex items-center justify-center text-accent text-sm font-medium">
          <CheckCircle className="w-4 h-4 mr-2" />
          Scan initiated successfully! Check results page for updates.
        </div>
      )}
    </form>
  );
}
