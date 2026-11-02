import type { Report, ReportOptions } from "@/server/domain";

export interface ReportInput {
  visitId: string;
  storagePath: string;
  sizeBytes: number | null;
  options: ReportOptions;
}

/** Generated reports. Never updated; removed only with their visit. */
export interface ReportRepository {
  listByVisit(visitId: string): Promise<Report[]>;
  findById(id: string): Promise<Report | null>;
  create(input: ReportInput): Promise<Report>;
}
