import { Copy } from '@ap/copy';
import { Zap } from 'lucide-react';

interface Command {
  name: string;
  description: string;
  premium?: boolean;
}

// Shared with the bot's command registration: this table is a picture of what
// Discord shows in the command picker, so the two must not disagree.
const commands: Command[] = [
  { name: '/ap enable', description: Copy.commands.ap.enable },
  { name: '/ap disable', description: Copy.commands.ap.disable },
  { name: '/ap overview', description: Copy.commands.ap.overview },
  { name: '/ap filters', description: Copy.commands.ap.filters, premium: true },
  { name: '/help', description: Copy.commands.help },
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
