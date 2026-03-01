import PageLayout from "../components/layout/PageLayout";
import { Card } from "../components/ui/card";
import { Button } from "../components/ui/button";

export default function TemplatePage() {
  return (
    <PageLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-1">Page Title</h1>
        <p className="text-sm text-gray-600">Short subtitle</p>
      </div>

      <Card className="p-6">
        <p className="text-sm text-gray-700">Put your content here.</p>
        <div className="mt-4">
          <Button>Primary Action</Button>
        </div>
      </Card>
    </PageLayout>
  );
}