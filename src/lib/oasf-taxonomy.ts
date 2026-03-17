// OASF v1.0.0 — Open Agentic Schema Framework taxonomy
// Skills and Domains from https://schema.oasf.outshift.com/1.0.0/skills & /domains
// Format: label (human-readable for UI) + slug (FLAT identifier for ERC-8004 registration)
// IMPORTANT: Slugs are FLAT (e.g. "summarization"), NOT hierarchical paths.

export interface OASFItem {
  label: string;
  slug: string;
}

export interface OASFCategory {
  label: string;
  items: OASFItem[];
}

// ── Skills Taxonomy ──

export const OASF_SKILLS: OASFCategory[] = [
  {
    label: 'Natural Language Processing',
    items: [
      { label: 'Summarization', slug: 'summarization' },
      { label: 'Question Answering', slug: 'question_answering' },
      { label: 'Sentiment Analysis', slug: 'sentiment_analysis' },
      { label: 'Translation', slug: 'translation' },
      { label: 'Named Entity Recognition', slug: 'named_entity_recognition' },
      { label: 'Storytelling', slug: 'storytelling' },
      { label: 'Dialogue Generation', slug: 'dialogue_generation' },
      { label: 'Fact Verification', slug: 'fact_verification' },
      { label: 'Problem Solving', slug: 'problem_solving' },
      { label: 'Content Moderation', slug: 'content_moderation' },
      { label: 'Style Transfer', slug: 'text_style_transfer' },
      { label: 'Text Completion', slug: 'text_completion' },
      { label: 'Contextual Comprehension', slug: 'contextual_comprehension' },
      { label: 'Search', slug: 'information_retrieval_synthesis_search' },
      { label: 'Paraphrasing', slug: 'paraphrasing' },
      { label: 'Fact Extraction', slug: 'fact_extraction' },
      { label: 'Bias Mitigation', slug: 'bias_mitigation' },
    ],
  },
  {
    label: 'Computer Vision',
    items: [
      { label: 'Image Generation', slug: 'image_generation' },
      { label: 'Image Classification', slug: 'image_classification' },
      { label: 'Object Detection', slug: 'object_detection' },
      { label: 'Image Segmentation', slug: 'image_segmentation' },
      { label: 'Depth Estimation', slug: 'depth_estimation' },
      { label: 'Image to 3D', slug: 'image_to_3d' },
    ],
  },
  {
    label: 'Multi Modal',
    items: [
      { label: 'Speech Recognition', slug: 'speech_recognition' },
      { label: 'Text-to-Speech', slug: 'text_to_speech' },
      { label: 'Text to Image', slug: 'text_to_image' },
      { label: 'Image to Text', slug: 'image_to_text' },
      { label: 'Visual QA', slug: 'visual_qa' },
      { label: 'Text to Video', slug: 'text_to_video' },
      { label: 'Text to 3D', slug: 'text_to_3d' },
    ],
  },
  {
    label: 'Analytical Skills',
    items: [
      { label: 'Code Generation', slug: 'text_to_code' },
      { label: 'Code Optimization', slug: 'code_optimization' },
      { label: 'Math Problem Solving', slug: 'math_word_problems' },
      { label: 'Theorem Proving', slug: 'theorem_proving' },
      { label: 'Pure Math', slug: 'pure_math_operations' },
    ],
  },
  {
    label: 'Data Engineering',
    items: [
      { label: 'Data Cleaning', slug: 'data_cleaning' },
      { label: 'Data Transformation', slug: 'data_transformation_pipeline' },
      { label: 'Feature Engineering', slug: 'feature_engineering' },
      { label: 'Schema Inference', slug: 'schema_inference' },
      { label: 'Data Quality Assessment', slug: 'data_quality_assessment' },
    ],
  },
  {
    label: 'RAG',
    items: [
      { label: 'Document QA', slug: 'document_or_database_question_answering' },
      { label: 'Document Retrieval', slug: 'document_retrieval' },
      { label: 'Search (RAG)', slug: 'retrieval_of_information_search' },
      { label: 'Indexing', slug: 'indexing' },
    ],
  },
  {
    label: 'Agent Orchestration',
    items: [
      { label: 'Task Decomposition', slug: 'task_decomposition' },
      { label: 'Multi-Agent Planning', slug: 'multi_agent_planning' },
      { label: 'Agent Coordination', slug: 'agent_coordination' },
      { label: 'Role Assignment', slug: 'role_assignment' },
      { label: 'Negotiation & Resolution', slug: 'negotiation_resolution' },
    ],
  },
  {
    label: 'Tool Interaction',
    items: [
      { label: 'API Understanding', slug: 'api_schema_understanding' },
      { label: 'Workflow Automation', slug: 'workflow_automation' },
      { label: 'Tool Use Planning', slug: 'tool_use_planning' },
      { label: 'Script Integration', slug: 'script_integration' },
    ],
  },
  {
    label: 'Security & Privacy',
    items: [
      { label: 'Vulnerability Analysis', slug: 'vulnerability_analysis' },
      { label: 'Threat Detection', slug: 'threat_detection' },
      { label: 'Secret Leak Detection', slug: 'secret_leak_detection' },
      { label: 'Privacy Risk Assessment', slug: 'privacy_risk_assessment' },
    ],
  },
  {
    label: 'DevOps & MLOps',
    items: [
      { label: 'CI/CD Configuration', slug: 'ci_cd_configuration' },
      { label: 'Deployment Orchestration', slug: 'deployment_orchestration' },
      { label: 'Infrastructure Provisioning', slug: 'infrastructure_provisioning' },
      { label: 'Monitoring & Alerting', slug: 'monitoring_alerting' },
    ],
  },
  {
    label: 'Advanced Reasoning',
    items: [
      { label: 'Strategic Planning', slug: 'strategic_planning' },
      { label: 'Chain of Thought', slug: 'chain_of_thought_structuring' },
      { label: 'Hypothesis Generation', slug: 'hypothesis_generation' },
      { label: 'Long Horizon Reasoning', slug: 'long_horizon_reasoning' },
    ],
  },
  {
    label: 'Evaluation & Monitoring',
    items: [
      { label: 'Anomaly Detection', slug: 'anomaly_detection' },
      { label: 'Performance Monitoring', slug: 'performance_monitoring' },
      { label: 'Quality Evaluation', slug: 'quality_evaluation' },
      { label: 'Test Case Generation', slug: 'test_case_generation' },
    ],
  },
  {
    label: 'Governance & Compliance',
    items: [
      { label: 'Compliance Assessment', slug: 'compliance_assessment' },
      { label: 'Policy Mapping', slug: 'policy_mapping' },
      { label: 'Risk Classification', slug: 'risk_classification' },
      { label: 'Audit Trail Summarization', slug: 'audit_trail_summarization' },
    ],
  },
];

// ── Domains Taxonomy ──

export const OASF_DOMAINS: OASFCategory[] = [
  {
    label: 'Technology',
    items: [
      { label: 'Software Engineering', slug: 'software_engineering' },
      { label: 'Software Development', slug: 'software_development' },
      { label: 'DevOps', slug: 'devops' },
      { label: 'APIs & Integration', slug: 'apis_integration' },
      { label: 'Data Science', slug: 'data_science' },
      { label: 'Big Data', slug: 'big_data' },
      { label: 'Data Visualization', slug: 'data_visualization' },
      { label: 'Blockchain', slug: 'blockchain' },
      { label: 'Cryptocurrency', slug: 'cryptocurrency' },
      { label: 'DeFi', slug: 'defi' },
      { label: 'Smart Contracts', slug: 'smart_contracts' },
      { label: 'Cybersecurity', slug: 'cybersecurity' },
      { label: 'Cloud Computing', slug: 'cloud_computing' },
      { label: 'Automation', slug: 'process_automation' },
      { label: 'IoT', slug: 'internet_of_things' },
      { label: 'Networking', slug: 'networking' },
      { label: 'MLOps', slug: 'mlops' },
    ],
  },
  {
    label: 'Finance & Business',
    items: [
      { label: 'Finance', slug: 'finance' },
      { label: 'Banking', slug: 'banking' },
      { label: 'Investment Services', slug: 'investment_services' },
      { label: 'Retail', slug: 'retail' },
      { label: 'Consumer Goods', slug: 'consumer_goods' },
    ],
  },
  {
    label: 'Healthcare',
    items: [
      { label: 'Telemedicine', slug: 'telemedicine' },
      { label: 'Healthcare Informatics', slug: 'healthcare_informatics' },
      { label: 'Medical Technology', slug: 'medical_technology' },
      { label: 'Patient Management', slug: 'patient_management_systems' },
    ],
  },
  {
    label: 'Education',
    items: [
      { label: 'E-Learning', slug: 'e_learning' },
      { label: 'Educational Technology', slug: 'educational_technology' },
      { label: 'Curriculum Design', slug: 'curriculum_design' },
      { label: 'Pedagogy', slug: 'pedagogy' },
    ],
  },
  {
    label: 'Legal',
    items: [
      { label: 'Regulatory Compliance', slug: 'regulatory_compliance' },
      { label: 'Contract Law', slug: 'contract_law' },
      { label: 'Intellectual Property', slug: 'intellectual_property' },
      { label: 'Litigation', slug: 'litigation' },
      { label: 'Legal Research', slug: 'legal_research' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Digital Marketing', slug: 'digital_marketing' },
      { label: 'Market Research', slug: 'market_research' },
      { label: 'Marketing Analytics', slug: 'marketing_analytics' },
      { label: 'Advertising', slug: 'advertising' },
      { label: 'Brand Management', slug: 'brand_management' },
    ],
  },
  {
    label: 'Retail & E-commerce',
    items: [
      { label: 'Online Retail', slug: 'online_retail' },
      { label: 'Customer Experience', slug: 'customer_experience' },
      { label: 'Retail Analytics', slug: 'retail_analytics' },
      { label: 'Inventory Management', slug: 'inventory_management' },
    ],
  },
  {
    label: 'Media & Entertainment',
    items: [
      { label: 'Gaming', slug: 'gaming' },
      { label: 'Content Creation', slug: 'content_creation' },
      { label: 'Digital Media', slug: 'digital_media' },
      { label: 'Streaming Services', slug: 'streaming_services' },
      { label: 'Broadcasting', slug: 'broadcasting' },
    ],
  },
  {
    label: 'R&D',
    items: [
      { label: 'Scientific Research', slug: 'scientific_research' },
      { label: 'Product Development', slug: 'product_development' },
      { label: 'Innovation Management', slug: 'innovation_management' },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'Recruitment', slug: 'recruitment' },
      { label: 'Training & Development', slug: 'training_and_development' },
      { label: 'HR Analytics', slug: 'hr_analytics' },
    ],
  },
  {
    label: 'Trust & Safety',
    items: [
      { label: 'Content Moderation', slug: 'content_moderation' },
      { label: 'Fraud Prevention', slug: 'fraud_prevention' },
      { label: 'Data Privacy', slug: 'data_privacy' },
      { label: 'Risk Management', slug: 'risk_management' },
      { label: 'Online Safety', slug: 'online_safety' },
    ],
  },
  {
    label: 'Manufacturing',
    items: [
      { label: 'Automation', slug: 'automation' },
      { label: 'Robotics', slug: 'robotics' },
      { label: 'Supply Chain Management', slug: 'supply_chain_management' },
      { label: 'Lean Manufacturing', slug: 'lean_manufacturing' },
    ],
  },
  {
    label: 'Transportation',
    items: [
      { label: 'Logistics', slug: 'logistics' },
      { label: 'Autonomous Vehicles', slug: 'autonomous_vehicles' },
      { label: 'Supply Chain', slug: 'supply_chain' },
      { label: 'Automotive', slug: 'automotive' },
    ],
  },
  {
    label: 'Energy',
    items: [
      { label: 'Renewable Energy', slug: 'renewable_energy' },
      { label: 'Smart Grids', slug: 'smart_grids' },
      { label: 'Energy Management', slug: 'energy_management' },
    ],
  },
  {
    label: 'Environmental Science',
    items: [
      { label: 'Climate Science', slug: 'climate_science' },
      { label: 'Sustainability', slug: 'sustainability' },
      { label: 'Environmental Monitoring', slug: 'environmental_monitoring' },
    ],
  },
  {
    label: 'Life Science',
    items: [
      { label: 'Biotechnology', slug: 'biotechnology' },
      { label: 'Genomics', slug: 'genomics' },
      { label: 'Pharmaceutical Research', slug: 'pharmaceutical_research' },
      { label: 'Bioinformatics', slug: 'bioinformatics' },
    ],
  },
  {
    label: 'Insurance',
    items: [
      { label: 'InsurTech', slug: 'insurtech' },
      { label: 'Actuarial Science', slug: 'actuarial_science' },
      { label: 'Claims Processing', slug: 'claims_processing' },
    ],
  },
];

// ── Helpers ──

// Flat sets for fast lookup (by label — used in UI selection)
export const ALL_OASF_SKILLS = new Set(OASF_SKILLS.flatMap(c => c.items.map(i => i.label)));
export const ALL_OASF_DOMAINS = new Set(OASF_DOMAINS.flatMap(c => c.items.map(i => i.label)));

// Label → Slug maps for ERC-8004 registration
export const SKILL_LABEL_TO_SLUG = new Map<string, string>(
  OASF_SKILLS.flatMap(c => c.items.map(i => [i.label, i.slug] as const)),
);
export const DOMAIN_LABEL_TO_SLUG = new Map<string, string>(
  OASF_DOMAINS.flatMap(c => c.items.map(i => [i.label, i.slug] as const)),
);

// Slug → Label maps for importing existing 8004 registrations
export const SKILL_SLUG_TO_LABEL = new Map<string, string>(
  OASF_SKILLS.flatMap(c => c.items.map(i => [i.slug, i.label] as const)),
);
export const DOMAIN_SLUG_TO_LABEL = new Map<string, string>(
  OASF_DOMAINS.flatMap(c => c.items.map(i => [i.slug, i.label] as const)),
);

/** Convert label array to slug array for ERC-8004 registration */
export function skillLabelsToSlugs(labels: string[]): string[] {
  return labels.map(l => SKILL_LABEL_TO_SLUG.get(l) || l);
}

/** Convert label array to slug array for ERC-8004 registration */
export function domainLabelsToSlugs(labels: string[]): string[] {
  return labels.map(l => DOMAIN_LABEL_TO_SLUG.get(l) || l);
}

/** Convert slug array to label array (for importing existing registrations) */
export function skillSlugsToLabels(slugs: string[]): string[] {
  return slugs.map(s => SKILL_SLUG_TO_LABEL.get(s) || s);
}

/** Convert slug array to label array (for importing existing registrations) */
export function domainSlugsToLabels(slugs: string[]): string[] {
  return slugs.map(s => DOMAIN_SLUG_TO_LABEL.get(s) || s);
}
