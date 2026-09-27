'use client';

import {
  ArrowRight,
  CircleCheck,
  CirclePause,
  Filter,
  type LucideIcon,
  RotateCcw,
  SearchCheck,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { InviteBotButton } from '@/components/marketing/invite-bot-button';
import { useLegacySunsetLabel, useSiteConfig } from '@/components/site-config-context';
import { Button } from '@/components/ui/button';
import {
  Questionnaire,
  QuestionnaireActions,
  QuestionnaireChoice,
  QuestionnaireChoices,
  QuestionnaireError,
  QuestionnaireItem,
  QuestionnaireNext,
  QuestionnairePrevious,
  QuestionnaireProgress,
  QuestionnaireSubmit,
  QuestionnaireTitle,
} from '@/components/ui/questionnaire';

// MIGRATION: remove with the rest of the migration UX at sunset.

type Answers = {
  bot?: 'yes' | 'no';
  channels?: 'yes' | 'no' | 'unsure';
  premium?: 'yes' | 'no';
};

type QuestionName = keyof Answers;

type Question = {
  name: QuestionName;
  title: string;
  choices: { value: string; label: string }[];
};

type Tone = 'danger' | 'warning' | 'success' | 'info';

type Outcome = {
  key: string;
  tone: Tone;
  icon: LucideIcon;
  title: string;
  body: string;
  action?: 'invite' | keyof typeof linkActions;
};

const linkActions = {
  migrate: { href: '/dashboard', label: 'Migrate now' },
  dashboard: { href: '/dashboard', label: 'Open dashboard' },
  premium: { href: '/premium', label: 'See Premium' },
};

const toneStyles: Record<Tone, string> = {
  danger: 'bg-red-500/10 text-red-400',
  warning: 'bg-amber-500/10 text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-400',
  info: 'bg-blue-500/10 text-blue-400',
};

const yesNo = [
  { value: 'yes', label: 'Yes' },
  { value: 'no', label: 'No' },
];

const itemClassName =
  'data-active:animate-in data-active:fade-in-0 data-active:slide-in-from-bottom-2 data-active:duration-300 motion-reduce:animate-none';

function buildQuestions(limit: number): Question[] {
  return [
    {
      name: 'bot',
      title: 'Is your server using Auto Publisher 2 or Auto Publisher 3?',
      choices: yesNo,
    },
    {
      name: 'channels',
      title: `Does the bot publish in more than ${limit} channels?`,
      choices: [...yesNo, { value: 'unsure', label: 'Not sure' }],
    },
    {
      name: 'premium',
      title: 'Do you want priority publishing or message filters?',
      choices: yesNo,
    },
  ];
}

function buildOutcomes(answers: Answers, limit: number, sunset: string): Outcome[] {
  const outcomes: Outcome[] = [];

  if (answers.bot === 'yes') {
    outcomes.push({
      key: 'bot',
      tone: 'warning',
      icon: TriangleAlert,
      title: 'Switch to the main Auto Publisher bot',
      body: `Auto Publisher 2 and 3 are retiring on ${sunset}. Add the main bot to your server and pick the channels you want it to publish.`,
      action: 'invite',
    });
  } else if (answers.channels === 'yes') {
    outcomes.push({
      key: 'channels',
      tone: 'danger',
      icon: CirclePause,
      title: `Pick your channels before ${sunset}`,
      body: `On that date, servers publishing in more than ${limit} channels are paused until someone picks which ones to keep. Choose yours now and your announcements keep going without a break.`,
      action: 'migrate',
    });
  } else if (answers.channels === 'no') {
    outcomes.push({
      key: 'channels',
      tone: 'success',
      icon: CircleCheck,
      title: 'You’re all set',
      body: `Your server switches over by itself on ${sunset} and keeps publishing as usual. You can also migrate sooner from the dashboard to pick your channels yourself.`,
    });
  } else {
    outcomes.push({
      key: 'channels',
      tone: 'info',
      icon: SearchCheck,
      title: 'Check your channel count',
      body: `Run /ap overview in your server or open the dashboard to see how many channels the bot publishes in. If it’s more than ${limit}, pick your channels before ${sunset}.`,
      action: 'dashboard',
    });
  }

  if (answers.premium === 'yes') {
    outcomes.push({
      key: 'premium',
      tone: 'info',
      icon: Filter,
      title: 'Unlock Premium after migration',
      body: 'Once your server is migrated, you can upgrade to get unlimited channels, message filters and priority publishing.',
      action: 'premium',
    });
  }

  return outcomes;
}

function OutcomeAction({ action }: { action: NonNullable<Outcome['action']> }) {
  if (action === 'invite') {
    return (
      <InviteBotButton size="sm" showDashboardNudge>
        Invite Auto Publisher
        <ArrowRight />
      </InviteBotButton>
    );
  }
  const { href, label } = linkActions[action];
  return (
    <Button size="sm" variant="outline" asChild>
      <Link href={href}>
        {label}
        <ArrowRight />
      </Link>
    </Button>
  );
}

export function MigrationCheck() {
  const { freeChannelLimit } = useSiteConfig();
  const sunset = useLegacySunsetLabel();
  const [answers, setAnswers] = useState<Answers>({});
  const [submitted, setSubmitted] = useState(false);
  // Remounting is the reset: the primitive keeps its own active-item state.
  const [attempt, setAttempt] = useState(0);
  const resultHeading = useRef<HTMLHeadingElement>(null);

  const questions = useMemo(() => buildQuestions(freeChannelLimit), [freeChannelLimit]);
  // The retiring bots stop outright, so their channel count changes nothing.
  const skipChannels = answers.bot === 'yes';
  const isSkipped = (name: QuestionName) => name === 'channels' && skipChannels;
  const items = useMemo(
    () =>
      questions.map(q => ({
        name: q.name,
        required: true,
        disabled: q.name === 'channels' && skipChannels,
      })),
    [questions, skipChannels]
  );

  useEffect(() => {
    if (submitted) resultHeading.current?.focus();
  }, [submitted]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
  }

  function startOver() {
    setAnswers({});
    setSubmitted(false);
    setAttempt(n => n + 1);
  }

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 sm:p-6 backdrop-blur-sm">
      {submitted ? (
        <div className="flex flex-col gap-4">
          <h3
            ref={resultHeading}
            tabIndex={-1}
            className="text-base font-medium text-white outline-none"
          >
            Here is what to expect
          </h3>
          <ul className="flex flex-col gap-3">
            {buildOutcomes(answers, freeChannelLimit, sunset).map(outcome => (
              <li
                key={outcome.key}
                className="flex items-start gap-4 rounded-xl border border-slate-800 bg-slate-950/40 px-4 py-4"
              >
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneStyles[outcome.tone]}`}
                >
                  <outcome.icon className="h-5 w-5" />
                </div>
                <div className="flex min-w-0 flex-col items-start gap-3">
                  <div>
                    <p className="font-medium text-white mb-1">{outcome.title}</p>
                    <p className="text-sm text-slate-400">{outcome.body}</p>
                  </div>
                  {outcome.action && <OutcomeAction action={outcome.action} />}
                </div>
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="self-start" onClick={startOver}>
            <RotateCcw />
            Start over
          </Button>
        </div>
      ) : (
        <Questionnaire key={attempt} items={items} onSubmit={handleSubmit}>
          <QuestionnaireProgress
            render={(props, state) => (
              <div {...props}>
                Question {state.current} of {state.total}
              </div>
            )}
          />
          {questions.map(question => (
            <QuestionnaireItem
              key={question.name}
              name={question.name}
              required
              disabled={isSkipped(question.name)}
              className={itemClassName}
            >
              <QuestionnaireTitle className="text-white">{question.title}</QuestionnaireTitle>
              <QuestionnaireChoices>
                {question.choices.map(choice => (
                  <QuestionnaireChoice
                    key={choice.value}
                    value={choice.value}
                    checked={answers[question.name] === choice.value}
                    onChange={() =>
                      setAnswers(current => ({ ...current, [question.name]: choice.value }))
                    }
                  >
                    {choice.label}
                  </QuestionnaireChoice>
                ))}
              </QuestionnaireChoices>
              <QuestionnaireError />
            </QuestionnaireItem>
          ))}
          <QuestionnaireActions>
            <QuestionnairePrevious />
            <QuestionnaireNext />
            <QuestionnaireSubmit>See what happens</QuestionnaireSubmit>
          </QuestionnaireActions>
        </Questionnaire>
      )}
    </div>
  );
}
