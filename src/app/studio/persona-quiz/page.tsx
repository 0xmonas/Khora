'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };
const goldBloom = { color: '#c8b439', textShadow: '0 0 8px rgba(200,180,57,0.6), 0 0 20px rgba(200,180,57,0.2)' };
const dimText = { color: '#999' };
const bodyText = { color: '#ccc' };

const BOOA_CONTRACT = '0x7aecA981734d133d3f695937508C48483BA6b654';

interface AgentTrait {
  id: number;
  name: string;
  creature: string;
  vibe: string;
  emoji: string;
  skills: string[];
  domains: string[];
  image: string;
}

// 6 personality dimensions — each question maps to weighted dimensions
type Dimension = 'tech' | 'chaos' | 'social' | 'mystic' | 'combat' | 'stealth';
type DimensionVec = Record<Dimension, number>;

interface Question {
  text: string;
  options: { label: string; weights: Partial<DimensionVec> }[];
}

const ZERO_VEC: DimensionVec = { tech: 0, chaos: 0, social: 0, mystic: 0, combat: 0, stealth: 0 };

const QUESTIONS: Question[] = [
  {
    text: 'You encounter a problem you\'ve never seen before. What\'s your first move?',
    options: [
      { label: 'Break it down into smaller pieces', weights: { tech: 3, stealth: 1 } },
      { label: 'Ask someone who might know', weights: { social: 3, mystic: 1 } },
      { label: 'Experiment wildly until something works', weights: { chaos: 3, combat: 1 } },
      { label: 'Research everything before acting', weights: { tech: 2, mystic: 2 } },
    ],
  },
  {
    text: 'Which environment feels most like home?',
    options: [
      { label: 'A neon-lit terminal at 3am', weights: { tech: 3, stealth: 2 } },
      { label: 'A library with infinite shelves', weights: { mystic: 3, tech: 1 } },
      { label: 'A crowded bazaar full of strangers', weights: { social: 3, chaos: 1 } },
      { label: 'A rooftop overlooking the whole city', weights: { stealth: 3, combat: 1 } },
    ],
  },
  {
    text: 'Someone asks for your help but the task is risky. You...',
    options: [
      { label: 'Calculate the odds and decide', weights: { tech: 2, stealth: 2 } },
      { label: 'Dive in without hesitation', weights: { combat: 3, chaos: 1 } },
      { label: 'Help but set clear boundaries', weights: { social: 2, mystic: 2 } },
      { label: 'Find a way to turn the risk into an advantage', weights: { chaos: 2, stealth: 2 } },
    ],
  },
  {
    text: 'How do you communicate?',
    options: [
      { label: 'Direct and efficient — no fluff', weights: { combat: 2, tech: 2 } },
      { label: 'Through stories and metaphors', weights: { mystic: 3, social: 1 } },
      { label: 'With sarcasm and dark humor', weights: { chaos: 3, stealth: 1 } },
      { label: 'Only when absolutely necessary', weights: { stealth: 3, mystic: 1 } },
    ],
  },
  {
    text: 'What drives you?',
    options: [
      { label: 'Building systems that outlast me', weights: { tech: 3, mystic: 1 } },
      { label: 'Protecting those who can\'t protect themselves', weights: { combat: 2, social: 2 } },
      { label: 'Tearing down what doesn\'t work', weights: { chaos: 3, combat: 1 } },
      { label: 'Seeing what no one else can see', weights: { stealth: 2, mystic: 2 } },
    ],
  },
  {
    text: 'Pick the skill that calls to you.',
    options: [
      { label: 'Reading code like it\'s poetry', weights: { tech: 4 } },
      { label: 'Talking your way out of anything', weights: { social: 3, chaos: 1 } },
      { label: 'Disappearing in plain sight', weights: { stealth: 4 } },
      { label: 'Knowing what happens next', weights: { mystic: 3, stealth: 1 } },
    ],
  },
  {
    text: 'Your ideal Friday night?',
    options: [
      { label: 'Tinkering with something no one asked for', weights: { tech: 2, chaos: 2 } },
      { label: 'Deep conversation with one person', weights: { social: 2, mystic: 2 } },
      { label: 'Somewhere loud and unpredictable', weights: { chaos: 3, social: 1 } },
      { label: 'Alone, watching, thinking', weights: { stealth: 3, mystic: 1 } },
    ],
  },
];

// Keywords in creature/vibe descriptions mapped to dimensions
const DIMENSION_KEYWORDS: Record<Dimension, string[]> = {
  tech: ['cyber', 'code', 'data', 'neural', 'synthetic', 'android', 'circuit', 'algorithm', 'processor', 'engineer', 'modular', 'terminal', 'protocol', 'digital', 'holographic', 'encrypted', 'compile', 'binary', 'server', 'debug', 'hardware', 'firmware', 'software', 'machine', 'compute', 'logic', 'system', 'network', 'chassis', 'hydraulic', 'optic', 'sensor'],
  chaos: ['chaotic', 'feral', 'wild', 'erratic', 'manic', 'frantic', 'glitch', 'unstable', 'volatile', 'explosive', 'demolition', 'reckless', 'unhinged', 'caffeinated', 'rapid-fire', 'scrambled', 'haywire', 'overload', 'surge', 'maniac', 'berserker', 'frenzy'],
  social: ['merchant', 'diplomat', 'courier', 'trade', 'broker', 'negotiat', 'charm', 'persuasi', 'vendor', 'bartender', 'host', 'guide', 'teacher', 'counsel', 'transactional', 'melodic', 'vending', 'dispensing', 'service'],
  mystic: ['ghost', 'soul', 'spirit', 'oracle', 'prophet', 'dream', 'ancient', 'ritual', 'mystic', 'reaper', 'djinn', 'singularity', 'riddle', 'ominous', 'spectral', 'ethereal', 'void', 'shadow', 'occult', 'arcane', 'cosmic', 'astral', 'phantom', 'wraith'],
  combat: ['bounty', 'hunter', 'warrior', 'combat', 'weapon', 'armor', 'mercenary', 'enforcer', 'military', 'tactical', 'assault', 'fang', 'claw', 'guard', 'bouncer', 'fighter', 'kill', 'strike', 'siege', 'patrol', 'sentry', 'wolf', 'shark', 'predator', 'badger'],
  stealth: ['shadow', 'stealth', 'covert', 'surveillance', 'silent', 'hidden', 'detective', 'spy', 'infiltrat', 'recon', 'observer', 'invisible', 'cloaked', 'noir', 'cynical', 'unimpressed', 'scarecrow', 'ghost-code', 'monitor', 'watch'],
};

// Skill/domain → dimension mapping
const SKILL_DIMENSION: Record<string, Dimension> = {
  'Code Generation': 'tech', 'Code Optimization': 'tech', 'Software Engineering': 'tech',
  'Data Science': 'tech', 'Data Cleaning': 'tech', 'Data Transformation': 'tech',
  'Math Problem Solving': 'tech', 'Schema Inference': 'tech', 'Feature Engineering': 'tech',
  'CI/CD Configuration': 'tech', 'Infrastructure Provisioning': 'tech', 'Deployment Orchestration': 'tech',
  'Vulnerability Analysis': 'stealth', 'Threat Detection': 'stealth', 'Secret Leak Detection': 'stealth',
  'Privacy Risk Assessment': 'stealth', 'Anomaly Detection': 'stealth', 'Monitoring & Alerting': 'stealth',
  'Dialogue Generation': 'social', 'Negotiation & Resolution': 'social', 'Storytelling': 'social',
  'Question Answering': 'social', 'Summarization': 'social', 'Translation': 'social',
  'Sentiment Analysis': 'social', 'Content Moderation': 'social',
  'Image Generation': 'chaos', 'Text to Image': 'chaos', 'Style Transfer': 'chaos',
  'Image to 3D': 'chaos', 'Text to Video': 'chaos', 'Text to 3D': 'chaos',
  'Hypothesis Generation': 'mystic', 'Long Horizon Reasoning': 'mystic',
  'Chain of Thought': 'mystic', 'Strategic Planning': 'mystic', 'Theorem Proving': 'mystic',
  'Task Decomposition': 'combat', 'Multi-Agent Planning': 'combat', 'Agent Coordination': 'combat',
  'Role Assignment': 'combat', 'Workflow Automation': 'combat',
};

// Build user's dimension vector from quiz answers
function buildUserVec(answers: number[]): DimensionVec {
  const vec = { ...ZERO_VEC };
  answers.forEach((answerIdx, qIdx) => {
    if (answerIdx >= 0 && QUESTIONS[qIdx]) {
      const weights = QUESTIONS[qIdx].options[answerIdx].weights;
      for (const [dim, val] of Object.entries(weights)) {
        vec[dim as Dimension] += val as number;
      }
    }
  });
  return vec;
}

// Build agent's dimension vector from traits
function buildAgentVec(agent: AgentTrait): DimensionVec {
  const vec = { ...ZERO_VEC };
  const text = `${agent.creature} ${agent.vibe}`.toLowerCase();

  for (const [dim, keywords] of Object.entries(DIMENSION_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) vec[dim as Dimension] += 2;
    }
  }

  for (const skill of agent.skills) {
    const dim = SKILL_DIMENSION[skill];
    if (dim) vec[dim] += 3;
  }

  for (const domain of agent.domains) {
    const dim = SKILL_DIMENSION[domain];
    if (dim) vec[dim] += 2;
  }

  return vec;
}

// Cosine similarity between two dimension vectors
function cosineSim(a: DimensionVec, b: DimensionVec): number {
  const dims = Object.keys(ZERO_VEC) as Dimension[];
  let dot = 0, magA = 0, magB = 0;
  for (const d of dims) {
    dot += a[d] * b[d];
    magA += a[d] * a[d];
    magB += b[d] * b[d];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

function matchAgent(answers: number[], agents: AgentTrait[]): AgentTrait[] {
  const userVec = buildUserVec(answers);

  const scored = agents.map(agent => ({
    agent,
    score: cosineSim(userVec, buildAgentVec(agent)),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, 3).map(s => s.agent);
}

export default function PersonaQuizPage() {
  const [agents, setAgents] = useState<AgentTrait[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentQ, setCurrentQ] = useState(0);
  const [answers, setAnswers] = useState<number[]>(new Array(QUESTIONS.length).fill(-1));
  const [showResult, setShowResult] = useState(false);

  useEffect(() => {
    fetch('/data/agents.json')
      .then(r => r.json())
      .then(setAgents)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleAnswer = useCallback((optionIdx: number) => {
    const next = [...answers];
    next[currentQ] = optionIdx;
    setAnswers(next);

    if (currentQ < QUESTIONS.length - 1) {
      setCurrentQ(currentQ + 1);
    } else {
      setShowResult(true);
    }
  }, [answers, currentQ]);

  const matches = useMemo(() => {
    if (!showResult || agents.length === 0) return [];
    return matchAgent(answers, agents);
  }, [showResult, answers, agents]);

  const reset = useCallback(() => {
    setCurrentQ(0);
    setAnswers(new Array(QUESTIONS.length).fill(-1));
    setShowResult(false);
  }, []);

  const question = QUESTIONS[currentQ];
  const progress = ((currentQ + (showResult ? 1 : 0)) / QUESTIONS.length) * 100;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              {/* Back + Title */}
              <div className="space-y-3 mb-8">
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Studio
                </Link>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Persona Quiz
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Answer 7 questions and find your BOOA match among 3,333 agents.
                </p>
              </div>

              {/* Quiz Content */}
              <div className="max-w-lg mx-auto space-y-8">

          {/* Progress bar */}
          <div className="h-[2px] bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-[#c8b439] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>

          {loading ? (
            <div className="text-center py-12">
              <p className="text-xs text-muted-foreground animate-pulse">Loading 3,333 agents...</p>
            </div>
          ) : !showResult ? (
            /* Question */
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-[10px] uppercase tracking-wider" style={dimText}>
                  {currentQ + 1} / {QUESTIONS.length}
                </p>
                <p className="text-sm leading-relaxed" style={bodyText}>
                  {question.text}
                </p>
              </div>

              <div className="space-y-2">
                {question.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    className="w-full text-left p-4 border-2 border-neutral-700 dark:border-neutral-200 text-xs transition-colors hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 active:bg-neutral-700/10 dark:active:bg-neutral-200/10"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {currentQ > 0 && (
                <button
                  onClick={() => setCurrentQ(currentQ - 1)}
                  className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                >
                  &larr; Back
                </button>
              )}
            </div>
          ) : (
            /* Results */
            <div className="space-y-6">
              <p className="text-[10px] uppercase tracking-widest text-center" style={dimText}>
                Your matches
              </p>

              {matches.map((agent, i) => (
                <a
                  key={agent.id}
                  href={`https://opensea.io/assets/shape/${BOOA_CONTRACT}/${agent.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block border-2 border-neutral-700 dark:border-neutral-200 p-5 space-y-3 transition-colors hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5"
                >
                  <div className="flex gap-4">
                    {agent.image && (
                      <img
                        src={agent.image}
                        alt={agent.name}
                        className="w-20 h-20 border border-[#444] bg-neutral-900 shrink-0"
                        style={{ imageRendering: 'pixelated' }}
                      />
                    )}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm truncate" style={i === 0 ? goldBloom : bodyText}>
                          {agent.emoji && `${agent.emoji} `}{agent.name}
                        </p>
                        <span className="text-[10px] px-2 py-0.5 border border-neutral-700 dark:border-neutral-200 shrink-0" style={i === 0 ? goldBloom : dimText}>
                          {i === 0 ? '#1 MATCH' : `#${i + 1}`}
                        </span>
                      </div>
                      <p className="text-[10px]" style={dimText}>BOOA #{agent.id}</p>
                      <p className="text-[9px] uppercase line-clamp-2" style={dimText}>{agent.creature}</p>
                      <p className="text-[10px]" style={bodyText}>Vibe: {agent.vibe}</p>
                    </div>
                  </div>

                  {(agent.skills.length > 0 || agent.domains.length > 0) && (
                    <div className="flex flex-wrap gap-1">
                      {agent.skills.slice(0, 3).map(s => (
                        <span key={s} className="px-1.5 py-0.5 text-[8px] border border-[#444] uppercase" style={bodyText}>{s}</span>
                      ))}
                      {agent.domains.slice(0, 2).map(d => (
                        <span key={d} className="px-1.5 py-0.5 text-[8px] border border-[#c8b439]/30 uppercase" style={goldBloom}>{d}</span>
                      ))}
                    </div>
                  )}

                  <p className="text-[9px] text-muted-foreground/40">
                    View on OpenSea &rarr;
                  </p>
                </a>
              ))}

              <div className="flex items-center justify-center gap-4 pt-4">
                <button
                  onClick={reset}
                  className="h-10 px-6 border-2 border-neutral-700 dark:border-neutral-200 text-xs transition-colors hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

              </div>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
