import { Zap } from 'lucide-react';

interface Command {
  name: string;
  description: string;
  premium?: boolean;
}

// Verbatim from the bot's own command registration (`apps/bot/src/commands/ap.ts`,
// `commands/static/help.ts`) — this table is a picture of what Discord shows in
// the command picker, so paraphrasing it would make the two disagree.
const commands: Command[] = [
  { name: '/ap enable', description: 'Enable auto-publishing in announcement channel' },
  { name: '/ap disable', description: 'Disable auto-publishing in announcement channel' },
  {
    name: '/ap overview',
    description: 'See publishing status for every channel in this server',
  },
  {
    name: '/ap filters',
    description: 'Choose exactly which messages auto-publish from each channel',
    premium: true,
  },
  {
    name: '/help',
    description: 'Discover all the ways you can use Auto Publisher to manage your channels!',
  },
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
