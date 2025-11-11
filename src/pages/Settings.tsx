import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function Settings() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Admin Settings</h1>
        <p className="text-muted-foreground">
          Configure system-wide preferences including tax rates, receipt branding, and backups.
        </p>
      </div>

      <Card className="border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Coming Soon</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          Detailed configuration screens will appear here once the core modules are in place.
        </CardContent>
      </Card>
    </div>
  );
}



