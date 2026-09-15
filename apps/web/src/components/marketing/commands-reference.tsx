import { Zap } from 'lucide-react';

interface Command {
  name: string;
  description: string;
  premium?: boolean;
}

const commands: Command[] = [
  { name: '/ap enable', description: 'Turn on auto-publishing for an announcement channel.' },
  { name: '/ap disable', description: 'Turn off auto-publishing for a channel.' },
  {
    name: '/ap overview',
    description: 'See publishing status for every channel in the server.',
  },
  {
    name: '/ap filters',
    description: 'Build the conditions that decide which messages get published.',
    premium: true,
  },
  { name: '/help', description: 'Overview of everything Auto Publisher can do.' },
];

export function CommandsReference() {
  return (
    <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
      <div className="text-center mb-12">
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">Commands</h2>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Manage everything from Discord with slash commands — or use the web dashboard, whichever
          you prefer.
        </p>
      </div>

      <div className="space-y-3">
        {commands.map(command => (
          <div
            key={command.name}
            className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-5 py-4 backdrop-blur-sm transition-colors hover:border-slate-700 sm:flex-row sm:items-center sm:gap-6"
          >
            <div className="flex items-center gap-2 sm:w-44 sm:shrink-0">
              <code className="font-mono text-sm text-blue-300">{command.name}</code>
              {command.premium && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300">
                  <Zap className="h-3 w-3" />
                  Premium
                </span>
              )}
            </div>
            <p className="text-sm text-slate-400">{command.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
