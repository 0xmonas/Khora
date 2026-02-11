// OASF v0.8.0 — Open Agentic Schema Framework taxonomy
// Skills and Domains mapped from https://schema.oasf.outshift.com/

export interface OASFCategory {
  label: string;
  items: string[];
}

export const OASF_SKILLS: OASFCategory[] = [
  { label: 'Natural Language Processing', items: ['Natural Language Processing', 'Summarization', 'Question Answering', 'Sentiment Analysis', 'Translation', 'Named Entity Recognition', 'Storytelling'] },
  { label: 'Computer Vision', items: ['Computer Vision', 'Image Generation', 'Image Classification', 'Object Detection'] },
  { label: 'Multi Modal', items: ['Speech Recognition', 'Text-to-Speech', 'Text to Image', 'Image to Text'] },
  { label: 'Analytical', items: ['Code Generation', 'Code Optimization', 'Math Problem Solving'] },
  { label: 'Data Engineering', items: ['Data Cleaning', 'Data Transformation'] },
  { label: 'RAG', items: ['Document QA (RAG)', 'Document Retrieval'] },
  { label: 'Agent Orchestration', items: ['Task Decomposition', 'Multi-Agent Planning'] },
  { label: 'Tool Interaction', items: ['API Understanding', 'Workflow Automation'] },
  { label: 'Security & Privacy', items: ['Vulnerability Analysis', 'Threat Detection'] },
  { label: 'DevOps & MLOps', items: ['CI/CD Configuration', 'Deployment Orchestration'] },
];

export const OASF_DOMAINS: OASFCategory[] = [
  { label: 'Technology', items: ['Technology', 'Software Engineering', 'DevOps', 'Data Science', 'Blockchain', 'DeFi', 'Cybersecurity', 'Cloud Computing'] },
  { label: 'Finance & Business', items: ['Finance', 'Banking'] },
  { label: 'Healthcare', items: ['Healthcare', 'Telemedicine', 'Healthcare Informatics'] },
  { label: 'Education', items: ['Education', 'E-Learning'] },
  { label: 'Legal', items: ['Legal', 'Regulatory Compliance', 'Contract Law'] },
  { label: 'Marketing', items: ['Marketing & Advertising', 'Digital Marketing'] },
  { label: 'Retail', items: ['Retail & E-commerce', 'Online Retail'] },
  { label: 'Media', items: ['Media & Entertainment', 'Gaming', 'Content Creation'] },
  { label: 'R&D', items: ['Research & Development', 'Scientific Research'] },
  { label: 'HR', items: ['Human Resources', 'Recruitment'] },
  { label: 'Trust & Safety', items: ['Trust & Safety', 'Content Moderation'] },
  { label: 'Manufacturing', items: ['Industrial Manufacturing', 'Automation'] },
  { label: 'Transportation', items: ['Transportation', 'Logistics'] },
];

// Flat sets for fast lookup
export const ALL_OASF_SKILLS = new Set(OASF_SKILLS.flatMap(c => c.items));
export const ALL_OASF_DOMAINS = new Set(OASF_DOMAINS.flatMap(c => c.items));
