import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Loading state of the site list. */
export default function SitesLoading() {
  return (
    <>
      <PageHeader eyebrow="Référentiel VIGIE" title="Sites" />
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Chargement des sites">
        <Skeleton className="h-11 w-full md:w-2/3" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, index) => (
            <Card key={index} className="flex flex-col gap-3 p-4">
              <Skeleton className="h-7 w-24 rounded-pill" />
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
