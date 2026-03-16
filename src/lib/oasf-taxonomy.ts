// OASF v0.8.0 — Open Agentic Schema Framework taxonomy
// Skills and Domains mapped from https://github.com/agntcy/oasf (schema/skills/ & schema/domains/)
// Format: label (human-readable for UI) + slug (hierarchical path for ERC-8004 registration)

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
      { label: 'Natural Language Processing', slug: 'natural_language_processing' },
      { label: 'Summarization', slug: 'natural_language_processing/natural_language_generation/summarization' },
      { label: 'Question Answering', slug: 'natural_language_processing/information_retrieval_synthesis/question_answering' },
      { label: 'Sentiment Analysis', slug: 'natural_language_processing/text_classification/sentiment_analysis' },
      { label: 'Translation', slug: 'natural_language_processing/language_translation/translation' },
      { label: 'Named Entity Recognition', slug: 'natural_language_processing/token_classification/named_entity_recognition' },
      { label: 'Storytelling', slug: 'natural_language_processing/creative_content/storytelling' },
      { label: 'Dialogue Generation', slug: 'natural_language_processing/natural_language_generation/dialogue_generation' },
      { label: 'Fact Verification', slug: 'natural_language_processing/analytical_reasoning/fact_verification' },
      { label: 'Problem Solving', slug: 'natural_language_processing/analytical_reasoning/problem_solving' },
      { label: 'Content Moderation', slug: 'natural_language_processing/ethical_interaction/content_moderation' },
      { label: 'Style Transfer', slug: 'natural_language_processing/natural_language_generation/style_transfer' },
      { label: 'Text Completion', slug: 'natural_language_processing/natural_language_generation/text_completion' },
      { label: 'Contextual Comprehension', slug: 'natural_language_processing/natural_language_understanding/contextual_comprehension' },
      { label: 'Search', slug: 'natural_language_processing/information_retrieval_synthesis/search' },
    ],
  },
  {
    label: 'Computer Vision',
    items: [
      { label: 'Computer Vision', slug: 'images_computer_vision' },
      { label: 'Image Generation', slug: 'images_computer_vision/image_generation' },
      { label: 'Image Classification', slug: 'images_computer_vision/image_classification' },
      { label: 'Object Detection', slug: 'images_computer_vision/object_detection' },
      { label: 'Image Segmentation', slug: 'images_computer_vision/image_segmentation' },
      { label: 'Depth Estimation', slug: 'images_computer_vision/depth_estimation' },
    ],
  },
  {
    label: 'Multi Modal',
    items: [
      { label: 'Multi Modal', slug: 'multi_modal' },
      { label: 'Speech Recognition', slug: 'multi_modal/audio_processing/speech_recognition' },
      { label: 'Text-to-Speech', slug: 'multi_modal/audio_processing/text_to_speech' },
      { label: 'Text to Image', slug: 'multi_modal/image_processing/text_to_image' },
      { label: 'Image to Text', slug: 'multi_modal/image_processing/image_to_text' },
      { label: 'Visual QA', slug: 'multi_modal/image_processing/visual_qa' },
      { label: 'Text to Video', slug: 'multi_modal/image_processing/text_to_video' },
    ],
  },
  {
    label: 'Analytical Skills',
    items: [
      { label: 'Analytical Skills', slug: 'analytical_skills' },
      { label: 'Code Generation', slug: 'analytical_skills/coding_skills/text_to_code' },
      { label: 'Code Optimization', slug: 'analytical_skills/coding_skills/code_optimization' },
      { label: 'Math Problem Solving', slug: 'analytical_skills/mathematical_reasoning/math_word_problems' },
      { label: 'Theorem Proving', slug: 'analytical_skills/mathematical_reasoning/theorem_proving' },
    ],
  },
  {
    label: 'Data Engineering',
    items: [
      { label: 'Data Engineering', slug: 'data_engineering' },
      { label: 'Data Cleaning', slug: 'data_engineering/data_cleaning' },
      { label: 'Data Transformation', slug: 'data_engineering/data_transformation_pipeline' },
      { label: 'Feature Engineering', slug: 'data_engineering/feature_engineering' },
      { label: 'Schema Inference', slug: 'data_engineering/schema_inference' },
      { label: 'Data Quality Assessment', slug: 'data_engineering/data_quality_assessment' },
    ],
  },
  {
    label: 'RAG',
    items: [
      { label: 'RAG', slug: 'retrieval_augmented_generation' },
      { label: 'Document QA (RAG)', slug: 'retrieval_augmented_generation/document_or_database_question_answering' },
      { label: 'Document Retrieval', slug: 'retrieval_augmented_generation/retrieval_of_information/document_retrieval' },
      { label: 'Search (RAG)', slug: 'retrieval_augmented_generation/retrieval_of_information/search' },
      { label: 'Indexing', slug: 'retrieval_augmented_generation/retrieval_of_information/indexing' },
    ],
  },
  {
    label: 'Agent Orchestration',
    items: [
      { label: 'Agent Orchestration', slug: 'agent_orchestration' },
      { label: 'Task Decomposition', slug: 'agent_orchestration/task_decomposition' },
      { label: 'Multi-Agent Planning', slug: 'agent_orchestration/multi_agent_planning' },
      { label: 'Agent Coordination', slug: 'agent_orchestration/agent_coordination' },
      { label: 'Role Assignment', slug: 'agent_orchestration/role_assignment' },
      { label: 'Negotiation & Resolution', slug: 'agent_orchestration/negotiation_resolution' },
    ],
  },
  {
    label: 'Tool Interaction',
    items: [
      { label: 'Tool Interaction', slug: 'tool_interaction' },
      { label: 'API Understanding', slug: 'tool_interaction/api_schema_understanding' },
      { label: 'Workflow Automation', slug: 'tool_interaction/workflow_automation' },
      { label: 'Tool Use Planning', slug: 'tool_interaction/tool_use_planning' },
      { label: 'Script Integration', slug: 'tool_interaction/script_integration' },
    ],
  },
  {
    label: 'Security & Privacy',
    items: [
      { label: 'Security & Privacy', slug: 'security_privacy' },
      { label: 'Vulnerability Analysis', slug: 'security_privacy/vulnerability_analysis' },
      { label: 'Threat Detection', slug: 'security_privacy/threat_detection' },
      { label: 'Secret Leak Detection', slug: 'security_privacy/secret_leak_detection' },
      { label: 'Privacy Risk Assessment', slug: 'security_privacy/privacy_risk_assessment' },
    ],
  },
  {
    label: 'DevOps & MLOps',
    items: [
      { label: 'DevOps & MLOps', slug: 'devops_mlops' },
      { label: 'CI/CD Configuration', slug: 'devops_mlops/ci_cd_configuration' },
      { label: 'Deployment Orchestration', slug: 'devops_mlops/deployment_orchestration' },
      { label: 'Infrastructure Provisioning', slug: 'devops_mlops/infrastructure_provisioning' },
      { label: 'Monitoring & Alerting', slug: 'devops_mlops/monitoring_alerting' },
    ],
  },
  {
    label: 'Advanced Reasoning',
    items: [
      { label: 'Advanced Reasoning & Planning', slug: 'advanced_reasoning_planning' },
      { label: 'Strategic Planning', slug: 'advanced_reasoning_planning/strategic_planning' },
      { label: 'Chain of Thought', slug: 'advanced_reasoning_planning/chain_of_thought_structuring' },
      { label: 'Hypothesis Generation', slug: 'advanced_reasoning_planning/hypothesis_generation' },
      { label: 'Long Horizon Reasoning', slug: 'advanced_reasoning_planning/long_horizon_reasoning' },
    ],
  },
  {
    label: 'Evaluation & Monitoring',
    items: [
      { label: 'Evaluation & Monitoring', slug: 'evaluation_monitoring' },
      { label: 'Anomaly Detection', slug: 'evaluation_monitoring/anomaly_detection' },
      { label: 'Performance Monitoring', slug: 'evaluation_monitoring/performance_monitoring' },
      { label: 'Quality Evaluation', slug: 'evaluation_monitoring/quality_evaluation' },
      { label: 'Test Case Generation', slug: 'evaluation_monitoring/test_case_generation' },
    ],
  },
  {
    label: 'Governance & Compliance',
    items: [
      { label: 'Governance & Compliance', slug: 'governance_compliance' },
      { label: 'Compliance Assessment', slug: 'governance_compliance/compliance_assessment' },
      { label: 'Policy Mapping', slug: 'governance_compliance/policy_mapping' },
      { label: 'Risk Classification', slug: 'governance_compliance/risk_classification' },
      { label: 'Audit Trail Summarization', slug: 'governance_compliance/audit_trail_summarization' },
    ],
  },
];

// ── Domains Taxonomy ──

export const OASF_DOMAINS: OASFCategory[] = [
  {
    label: 'Technology',
    items: [
      { label: 'Technology', slug: 'technology' },
      { label: 'Software Engineering', slug: 'technology/software_engineering' },
      { label: 'Software Development', slug: 'technology/software_engineering/software_development' },
      { label: 'DevOps', slug: 'technology/software_engineering/devops' },
      { label: 'APIs & Integration', slug: 'technology/software_engineering/apis_integration' },
      { label: 'Data Science', slug: 'technology/data_science' },
      { label: 'Big Data', slug: 'technology/data_science/big_data' },
      { label: 'Data Visualization', slug: 'technology/data_science/data_visualization' },
      { label: 'Blockchain', slug: 'technology/blockchain' },
      { label: 'Cryptocurrency', slug: 'technology/blockchain/cryptocurrency' },
      { label: 'DeFi', slug: 'technology/blockchain/defi' },
      { label: 'Smart Contracts', slug: 'technology/blockchain/smart_contracts' },
      { label: 'Cybersecurity', slug: 'technology/security/cybersecurity' },
      { label: 'Cloud Computing', slug: 'technology/cloud_computing' },
      { label: 'Automation', slug: 'technology/automation' },
      { label: 'IoT', slug: 'technology/iot' },
      { label: 'Networking', slug: 'technology/networking' },
    ],
  },
  {
    label: 'Finance & Business',
    items: [
      { label: 'Finance & Business', slug: 'finance_and_business' },
      { label: 'Finance', slug: 'finance_and_business/finance' },
      { label: 'Banking', slug: 'finance_and_business/banking' },
      { label: 'Investment Services', slug: 'finance_and_business/investment_services' },
      { label: 'Retail', slug: 'finance_and_business/retail' },
    ],
  },
  {
    label: 'Healthcare',
    items: [
      { label: 'Healthcare', slug: 'healthcare' },
      { label: 'Telemedicine', slug: 'healthcare/telemedicine' },
      { label: 'Healthcare Informatics', slug: 'healthcare/healthcare_informatics' },
      { label: 'Medical Technology', slug: 'healthcare/medical_technology' },
    ],
  },
  {
    label: 'Education',
    items: [
      { label: 'Education', slug: 'education' },
      { label: 'E-Learning', slug: 'education/e_learning' },
      { label: 'Educational Technology', slug: 'education/educational_technology' },
      { label: 'Curriculum Design', slug: 'education/curriculum_design' },
    ],
  },
  {
    label: 'Legal',
    items: [
      { label: 'Legal', slug: 'legal' },
      { label: 'Regulatory Compliance', slug: 'legal/regulatory_compliance' },
      { label: 'Contract Law', slug: 'legal/contract_law' },
      { label: 'Intellectual Property', slug: 'legal/intellectual_property' },
    ],
  },
  {
    label: 'Marketing',
    items: [
      { label: 'Marketing & Advertising', slug: 'marketing_and_advertising' },
      { label: 'Digital Marketing', slug: 'marketing_and_advertising/digital_marketing' },
      { label: 'Market Research', slug: 'marketing_and_advertising/market_research' },
      { label: 'Marketing Analytics', slug: 'marketing_and_advertising/marketing_analytics' },
    ],
  },
  {
    label: 'Retail & E-commerce',
    items: [
      { label: 'Retail & E-commerce', slug: 'retail_and_ecommerce' },
      { label: 'Online Retail', slug: 'retail_and_ecommerce/online_retail' },
      { label: 'Customer Experience', slug: 'retail_and_ecommerce/customer_experience' },
      { label: 'Retail Analytics', slug: 'retail_and_ecommerce/retail_analytics' },
    ],
  },
  {
    label: 'Media & Entertainment',
    items: [
      { label: 'Media & Entertainment', slug: 'media_and_entertainment' },
      { label: 'Gaming', slug: 'media_and_entertainment/gaming' },
      { label: 'Content Creation', slug: 'media_and_entertainment/content_creation' },
      { label: 'Digital Media', slug: 'media_and_entertainment/digital_media' },
      { label: 'Streaming Services', slug: 'media_and_entertainment/streaming_services' },
    ],
  },
  {
    label: 'R&D',
    items: [
      { label: 'Research & Development', slug: 'research_and_development' },
      { label: 'Scientific Research', slug: 'research_and_development/scientific_research' },
      { label: 'Product Development', slug: 'research_and_development/product_development' },
      { label: 'Innovation Management', slug: 'research_and_development/innovation_management' },
    ],
  },
  {
    label: 'HR',
    items: [
      { label: 'Human Resources', slug: 'human_resources' },
      { label: 'Recruitment', slug: 'human_resources/recruitment' },
      { label: 'Training & Development', slug: 'human_resources/training_and_development' },
      { label: 'HR Analytics', slug: 'human_resources/hr_analytics' },
    ],
  },
  {
    label: 'Trust & Safety',
    items: [
      { label: 'Trust & Safety', slug: 'trust_and_safety' },
      { label: 'Content Moderation', slug: 'trust_and_safety/content_moderation' },
      { label: 'Fraud Prevention', slug: 'trust_and_safety/fraud_prevention' },
      { label: 'Data Privacy', slug: 'trust_and_safety/data_privacy' },
      { label: 'Risk Management', slug: 'trust_and_safety/risk_management' },
    ],
  },
  {
    label: 'Manufacturing',
    items: [
      { label: 'Industrial Manufacturing', slug: 'industrial_manufacturing' },
      { label: 'Automation', slug: 'industrial_manufacturing/automation' },
      { label: 'Robotics', slug: 'industrial_manufacturing/robotics' },
      { label: 'Supply Chain Management', slug: 'industrial_manufacturing/supply_chain_management' },
    ],
  },
  {
    label: 'Transportation',
    items: [
      { label: 'Transportation', slug: 'transportation' },
      { label: 'Logistics', slug: 'transportation/logistics' },
      { label: 'Autonomous Vehicles', slug: 'transportation/autonomous_vehicles' },
      { label: 'Supply Chain', slug: 'transportation/supply_chain' },
    ],
  },
  {
    label: 'Energy',
    items: [
      { label: 'Energy', slug: 'energy' },
      { label: 'Renewable Energy', slug: 'energy/renewable_energy' },
      { label: 'Smart Grids', slug: 'energy/smart_grids' },
    ],
  },
  {
    label: 'Environmental Science',
    items: [
      { label: 'Environmental Science', slug: 'environmental_science' },
      { label: 'Climate Science', slug: 'environmental_science/climate_science' },
      { label: 'Sustainability', slug: 'environmental_science/sustainability' },
    ],
  },
  {
    label: 'Life Science',
    items: [
      { label: 'Life Science', slug: 'life_science' },
      { label: 'Biotechnology', slug: 'life_science/biotechnology' },
      { label: 'Genomics', slug: 'life_science/genomics' },
      { label: 'Pharmaceutical Research', slug: 'life_science/pharmaceutical_research' },
    ],
  },
  {
    label: 'Insurance',
    items: [
      { label: 'Insurance', slug: 'insurance' },
      { label: 'InsurTech', slug: 'insurance/insurtech' },
      { label: 'Actuarial Science', slug: 'insurance/actuarial_science' },
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
