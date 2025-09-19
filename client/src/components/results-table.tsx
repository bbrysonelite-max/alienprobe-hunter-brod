import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Link } from "wouter";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Database, AlertCircle, ExternalLink, Eye } from "lucide-react";

type ScanResult = {
  id: string;
  businessName: string;
  website?: string;
  status: string;
  scanData?: string;
  createdAt: string;
};

export default function ResultsTable() {
  const {
    data: results,
    isLoading,
    error,
  } = useQuery<ScanResult[]>({
    queryKey: ["/api/results"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2 text-muted-foreground">Loading scan results...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="bg-destructive/10 border-destructive/20">
        <CardContent className="p-6 text-center">
          <AlertCircle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Results</h3>
          <p className="text-destructive/80">
            Failed to load scan results. Please check your connection and try again.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!results || results.length === 0) {
    return (
      <Card className="bg-muted/50 border-border">
        <CardContent className="p-12 text-center">
          <Database className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-foreground mb-2">No Scans Yet</h3>
          <p className="text-muted-foreground">
            Start your first business scan to see results here. Use the scanner to analyze any business.
          </p>
        </CardContent>
      </Card>
    );
  }

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "completed":
        return <Badge className="bg-accent/10 text-accent border-accent/20" data-testid={`status-completed`}>Completed</Badge>;
      case "scanning":
        return <Badge className="bg-primary/10 text-primary border-primary/20" data-testid={`status-scanning`}>Scanning</Badge>;
      case "pending":
        return <Badge variant="outline" data-testid={`status-pending`}>Pending</Badge>;
      default:
        return <Badge variant="secondary" data-testid={`status-${status}`}>{status}</Badge>;
    }
  };

  const parseInsights = (scanData?: string) => {
    try {
      const data = scanData ? JSON.parse(scanData) : {};
      return data.insights || [];
    } catch {
      return [];
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="text-foreground font-semibold">Business Name</TableHead>
              <TableHead className="text-foreground font-semibold">Website</TableHead>
              <TableHead className="text-foreground font-semibold">Status</TableHead>
              <TableHead className="text-foreground font-semibold">Scan Date</TableHead>
              <TableHead className="text-foreground font-semibold">Insights</TableHead>
              <TableHead className="text-foreground font-semibold">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result) => (
              <TableRow key={result.id} className="hover:bg-muted/30" data-testid={`row-result-${result.id}`}>
                <TableCell className="font-medium text-foreground">
                  {result.businessName}
                </TableCell>
                <TableCell>
                  {result.website ? (
                    <a
                      href={result.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:text-primary/80 flex items-center text-sm"
                      data-testid={`link-website-${result.id}`}
                    >
                      <ExternalLink className="w-3 h-3 mr-1" />
                      Visit Site
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">No website</span>
                  )}
                </TableCell>
                <TableCell>
                  {getStatusBadge(result.status)}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(result.createdAt), "MMM dd, yyyy 'at' HH:mm")}
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    {parseInsights(result.scanData).slice(0, 2).map((insight: string, index: number) => (
                      <div
                        key={index}
                        className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1"
                        data-testid={`insight-${result.id}-${index}`}
                      >
                        {insight}
                      </div>
                    ))}
                    {parseInsights(result.scanData).length === 0 && (
                      <span className="text-xs text-muted-foreground">Processing...</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Link href={`/scan/${result.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-primary hover:text-primary-foreground"
                      data-testid={`button-view-details-${result.id}`}
                    >
                      <Eye className="w-4 h-4 mr-2" />
                      View Details
                    </Button>
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="text-center text-sm text-muted-foreground">
        Showing {results.length} scan result{results.length !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
