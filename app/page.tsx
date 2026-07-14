import { Button } from "@/components/ui/button";

const stack = [
  { name: "Next.js 15", detail: "App Router · TypeScript" },
  { name: "Tailwind CSS", detail: "v4 · shadcn/ui" },
  { name: "Prisma", detail: "PostgreSQL" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-10 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
          Phase 2 · Project setup
        </span>
        <h1 className="text-5xl font-bold tracking-tight">Hezalli</h1>
        <p className="max-w-xl text-pretty text-muted-foreground">
          A multi-vendor e-commerce marketplace. This is the freshly scaffolded
          app skeleton — Next.js, Tailwind CSS, shadcn/ui, and Prisma are wired
          up and ready for the features built in the phases ahead.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size="lg">Get started</Button>
        <Button size="lg" variant="outline">
          View the plan
        </Button>
      </div>

      <ul className="grid w-full gap-3 sm:grid-cols-3">
        {stack.map((item) => (
          <li
            key={item.name}
            className="rounded-lg border bg-card p-4 text-left text-card-foreground"
          >
            <p className="font-medium">{item.name}</p>
            <p className="text-sm text-muted-foreground">{item.detail}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
