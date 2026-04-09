import React from "react";

interface DashboardTileSectionProps {
  title: string;
  rows: React.ReactElement[][];
  rowPrefix: string;
}

export function DashboardTileSection({
  title,
  rows,
  rowPrefix,
}: DashboardTileSectionProps) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{title}</h3>
      </div>
      <div className="mt-3 space-y-4">
        {rows.map((row, idx) => (
          <div
            key={`${rowPrefix}-row-${idx}`}
            className={`flex flex-col sm:flex-row gap-6 items-stretch ${
              row.length < 3 ? "justify-center" : ""
            }`}
          >
            {row.map((tile, tileIndex) => (
              <div
                key={`${rowPrefix}-${idx}-${tileIndex}`}
                className="flex-1 min-w-0"
              >
                {tile}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
