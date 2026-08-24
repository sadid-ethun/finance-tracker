"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

import { Card, Section } from "@/components/shared/card";
import { Money } from "@/components/shared/money";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Skeleton } from "@/components/shared/states";
import { useCashFlow, useSpendingByCategory } from "@/hooks/use-finance";
import {
  axisProps,
  chartAnimation,
  chartConfig,
  formatAxisMoney,
  gridProps,
  seriesColor,
} from "@/lib/chart-theme";
import { formatMoney } from "@/lib/format";

function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Section label={title} action={action}>
      <Card className="p-5">{children}</Card>
    </Section>
  );
}

export function SpendingByCategory() {
  const query = useSpendingByCategory();
  const rows = query.data ?? [];
  const total = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <SectionCard title="Spending by category">
      {query.isLoading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-[14px] text-muted-foreground">
          No spending recorded this month.
        </p>
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row">
          <div className="relative size-[168px] shrink-0">
            <ChartContainer config={chartConfig} className="size-full">
              <PieChart>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      nameKey="name"
                      formatter={(value, name) => (
                        <span className="flex w-full justify-between gap-3">
                          <span className="text-muted-foreground">{name}</span>
                          <span className="tabular font-mono">{formatMoney(Number(value))}</span>
                        </span>
                      )}
                    />
                  }
                />
                <Pie
                  data={rows}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={58}
                  outerRadius={82}
                  paddingAngle={2}
                  stroke="none"
                  {...chartAnimation()}
                >
                  {rows.map((row, i) => (
                    <Cell key={row.name} fill={row.color ?? seriesColor(i)} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* Total in the middle: the donut's hole should answer "how much". */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[11px] text-muted-foreground">Total</span>
              <Money minorUnits={total} className="text-[17px] font-semibold" />
            </div>
          </div>

          <ul className="w-full flex-1 space-y-2">
            {rows.slice(0, 5).map((row, i) => (
              <li key={row.name} className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className="size-2.5 shrink-0 rounded-full"
                  style={{
                    backgroundColor: row.color ?? seriesColor(i),
                  }}
                />
                <span className="min-w-0 flex-1 truncate text-[14px]">{row.name}</span>
                <Money minorUnits={row.amount} className="text-[14px] font-medium" />
                <span className="tabular w-10 text-right text-[12px] text-muted-foreground">
                  {total > 0 ? Math.round((row.amount / total) * 100) : 0}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}

export function CashFlowChart() {
  const query = useCashFlow(6);
  const rows = query.data ?? [];
  const hasData = rows.some((r) => r.income > 0 || r.spending > 0);

  return (
    <SectionCard title="Cash flow">
      {query.isLoading ? (
        <Skeleton className="h-[200px] w-full" />
      ) : !hasData ? (
        <p className="py-8 text-center text-[14px] text-muted-foreground">
          Not enough history yet.
        </p>
      ) : (
        <>
          <div className="h-[180px] w-full">
            <ChartContainer config={chartConfig} className="size-full">
              <BarChart
                data={rows.map((r) => ({
                  ...r,
                  // Expenses render downward from a shared baseline.
                  spendingDown: -r.spending,
                  label: new Date(`${r.month}T00:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                  }),
                }))}
                margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
                barGap={2}
              >
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} />
                <YAxis
                  {...axisProps}
                  width={40}
                  tickFormatter={(value) => formatAxisMoney(Number(value))}
                />
                {/* Solid, against the dashed grid, so the line dividing income
                    from spending is not mistaken for a rule. */}
                <ReferenceLine y={0} stroke="var(--border)" strokeWidth={1} />
                <ChartTooltip
                  cursor={{ fill: "var(--secondary)", opacity: 0.4 }}
                  content={
                    <ChartTooltipContent
                      formatter={(value, name) => (
                        <span className="flex w-full justify-between gap-3">
                          <span className="text-muted-foreground">
                            {name === "income" ? "Income" : "Spending"}
                          </span>
                          <span className="tabular font-mono">
                            {formatMoney(Math.abs(Number(value)))}
                          </span>
                        </span>
                      )}
                    />
                  }
                />
                <Bar
                  dataKey="income"
                  fill="var(--color-income)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                  {...chartAnimation()}
                />
                <Bar
                  dataKey="spendingDown"
                  fill="var(--color-spending)"
                  // Recharts mirrors the radius array for a negative value, so
                  // this is the same order as the upward bar.
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                  {...chartAnimation()}
                />
              </BarChart>
            </ChartContainer>
          </div>

          <div className="mt-3 flex justify-center gap-5 border-t border-border pt-3 text-[12px]">
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: chartConfig.income.color }}
              />
              Income
            </span>
            <span className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="size-2 rounded-full"
                style={{ backgroundColor: chartConfig.spending.color }}
              />
              Spending
            </span>
          </div>
        </>
      )}
    </SectionCard>
  );
}

export { SectionCard, formatMoney };
