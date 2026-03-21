import type {
  ExtractedKeyword,
  KeywordCategory,
  KeywordExtractionResult,
} from '../types/resumeOptimization.types.js';

/**
 * Lightweight, dictionary + regex keyword extractor.
 * No external NLP dependency — uses curated term lists that cover
 * the skills / tools / certifications ATS systems typically scan for.
 */
export class KeywordExtractor {

  // ── Public API ──────────────────────────────────────────────────

  static extract(cleanText: string): KeywordExtractionResult {
    const lowerText = cleanText.toLowerCase();
    const found = new Map<string, ExtractedKeyword>();

    for (const [term, category] of this.dictionary()) {
      const freq = this.countOccurrences(lowerText, term.toLowerCase());
      if (freq > 0) {
        const canonical = this.canonicalize(term);
        const existing  = found.get(canonical);
        if (existing) {
          existing.frequency += freq;
        } else {
          found.set(canonical, { term: canonical, category, frequency: freq });
        }
      }
    }

    const keywords = [...found.values()].sort((a, b) => b.frequency - a.frequency);

    return {
      keywords,
      hardSkills:     this.byCategory(keywords, 'hard_skill'),
      tools:          this.byCategory(keywords, 'tool'),
      certifications: this.byCategory(keywords, 'certification'),
      methodologies:  this.byCategory(keywords, 'methodology'),
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────

  private static countOccurrences(text: string, term: string): number {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\b${escaped}\\b`, 'gi');
    return (text.match(re) || []).length;
  }

  private static canonicalize(term: string): string {
    return term
      .split(/[\s-]+/)
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }

  private static byCategory(kws: ExtractedKeyword[], cat: KeywordCategory): string[] {
    return kws.filter(k => k.category === cat).map(k => k.term);
  }

  // ── Term dictionary ─────────────────────────────────────────────
  // Returns [term, category] tuples. Keeping it as a method so it
  // can be extended or loaded from config without touching callers.

  private static dictionary(): [string, KeywordCategory][] {
    return [
      // ─ Programming languages ──────────────────────────────────
      ...this.asCategory([
        'JavaScript', 'TypeScript', 'Python', 'Java', 'C#', 'C\\+\\+',
        'Go', 'Golang', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
        'Scala', 'R', 'MATLAB', 'Perl', 'Lua', 'Dart', 'Elixir',
        'Clojure', 'Haskell', 'Objective-C', 'Shell', 'Bash',
        'SQL', 'PL/SQL', 'T-SQL', 'GraphQL',
      ], 'hard_skill'),

      // ─ Frontend ───────────────────────────────────────────────
      ...this.asCategory([
        'React', 'React.js', 'ReactJS', 'Angular', 'Vue', 'Vue.js',
        'Svelte', 'Next.js', 'NextJS', 'Nuxt', 'Gatsby',
        'HTML', 'HTML5', 'CSS', 'CSS3', 'SASS', 'SCSS', 'LESS',
        'Tailwind', 'Tailwind CSS', 'Bootstrap', 'Material UI', 'MUI',
        'Chakra UI', 'Styled Components', 'Ant Design',
        'Redux', 'MobX', 'Zustand', 'Recoil', 'Context API',
        'Webpack', 'Vite', 'Rollup', 'Parcel', 'esbuild',
        'Storybook', 'Figma', 'Responsive Design', 'Accessibility', 'a11y',
      ], 'hard_skill'),

      // ─ Backend / Server ───────────────────────────────────────
      ...this.asCategory([
        'Node.js', 'NodeJS', 'Express', 'Express.js', 'Fastify', 'NestJS',
        'Spring', 'Spring Boot', 'Django', 'Flask', 'FastAPI',
        'ASP.NET', '.NET', '.NET Core', 'Rails', 'Ruby on Rails',
        'Laravel', 'Symfony', 'Gin', 'Fiber', 'Actix',
        'REST', 'RESTful', 'REST API', 'gRPC', 'WebSocket',
        'Microservices', 'Monolith', 'Serverless',
        'OAuth', 'OAuth2', 'JWT', 'SSO', 'SAML',
      ], 'hard_skill'),

      // ─ Databases ──────────────────────────────────────────────
      ...this.asCategory([
        'MongoDB', 'Mongoose', 'PostgreSQL', 'Postgres', 'MySQL',
        'MariaDB', 'SQLite', 'Oracle', 'SQL Server', 'MSSQL',
        'Redis', 'Memcached', 'Elasticsearch', 'DynamoDB',
        'Cassandra', 'CouchDB', 'Neo4j', 'Firebase', 'Firestore',
        'Supabase', 'Prisma', 'TypeORM', 'Sequelize', 'Knex',
      ], 'hard_skill'),

      // ─ Cloud & Infra ──────────────────────────────────────────
      ...this.asCategory([
        'AWS', 'Amazon Web Services', 'Azure', 'GCP',
        'Google Cloud', 'Heroku', 'Vercel', 'Netlify', 'DigitalOcean',
        'EC2', 'S3', 'Lambda', 'CloudFront', 'ECS', 'EKS',
        'Docker', 'Kubernetes', 'K8s', 'Helm', 'Terraform',
        'Ansible', 'Pulumi', 'CloudFormation',
        'Nginx', 'Apache', 'Caddy', 'HAProxy',
        'Linux', 'Unix', 'Ubuntu', 'CentOS',
        'CI/CD', 'GitHub Actions', 'GitLab CI', 'Jenkins',
        'CircleCI', 'Travis CI', 'ArgoCD',
      ], 'hard_skill'),

      // ─ Data / ML / AI ─────────────────────────────────────────
      ...this.asCategory([
        'Machine Learning', 'Deep Learning', 'NLP',
        'Natural Language Processing', 'Computer Vision',
        'TensorFlow', 'PyTorch', 'Keras', 'Scikit-learn',
        'Pandas', 'NumPy', 'Spark', 'Apache Spark',
        'Hadoop', 'Airflow', 'dbt', 'ETL',
        'Data Engineering', 'Data Pipeline', 'Data Lake',
        'LLM', 'Large Language Model', 'RAG',
        'Prompt Engineering', 'OpenAI', 'GPT', 'Gemini',
        'LangChain', 'Vector Database', 'Pinecone',
      ], 'hard_skill'),

      // ─ Mobile ─────────────────────────────────────────────────
      ...this.asCategory([
        'React Native', 'Flutter', 'iOS', 'Android',
        'SwiftUI', 'Jetpack Compose', 'Xamarin', 'Ionic',
        'Expo', 'Capacitor', 'Cordova',
      ], 'hard_skill'),

      // ─ Testing ────────────────────────────────────────────────
      ...this.asCategory([
        'Unit Testing', 'Integration Testing', 'E2E Testing',
        'Jest', 'Mocha', 'Chai', 'Cypress', 'Playwright',
        'Selenium', 'Puppeteer', 'Vitest',
        'pytest', 'JUnit', 'TestNG', 'RSpec',
        'TDD', 'BDD', 'Test Driven Development',
      ], 'hard_skill'),

      // ─ DevOps / Observability ─────────────────────────────────
      ...this.asCategory([
        'Prometheus', 'Grafana', 'Datadog', 'New Relic',
        'Splunk', 'ELK Stack', 'Logstash', 'Kibana',
        'Sentry', 'PagerDuty', 'CloudWatch',
      ], 'tool'),

      // ─ Tools ──────────────────────────────────────────────────
      ...this.asCategory([
        'Git', 'GitHub', 'GitLab', 'Bitbucket',
        'Jira', 'Confluence', 'Trello', 'Asana', 'Linear',
        'Slack', 'VS Code', 'IntelliJ', 'Postman',
        'Swagger', 'OpenAPI', 'Insomnia',
        'npm', 'yarn', 'pnpm',
        'MinIO', 'RabbitMQ', 'Kafka', 'Apache Kafka',
        'SQS', 'SNS', 'QStash', 'Upstash',
        'Notion', 'Monday', 'ClickUp',
      ], 'tool'),

      // ─ Certifications ─────────────────────────────────────────
      ...this.asCategory([
        'AWS Certified', 'AWS Solutions Architect',
        'AWS Developer Associate', 'AWS SysOps',
        'Azure Certified', 'Azure Fundamentals',
        'GCP Professional', 'Google Cloud Certified',
        'CKA', 'CKAD', 'CKS',
        'PMP', 'PRINCE2', 'CSM', 'CSPO',
        'CISSP', 'CISM', 'CEH', 'CompTIA Security+',
        'CompTIA A+', 'CompTIA Network+',
        'CCNA', 'CCNP',
        'Scrum Master', 'SAFe', 'TOGAF',
        'ITIL', 'Six Sigma',
        'Terraform Associate', 'HashiCorp Certified',
      ], 'certification'),

      // ─ Methodologies ──────────────────────────────────────────
      ...this.asCategory([
        'Agile', 'Scrum', 'Kanban', 'Lean',
        'Waterfall', 'SAFe', 'XP', 'Extreme Programming',
        'DevOps', 'SRE', 'Site Reliability Engineering',
        'SOLID', 'DRY', 'KISS',
        'Design Patterns', 'Clean Architecture', 'Domain Driven Design', 'DDD',
        'Event Driven Architecture', 'CQRS', 'Event Sourcing',
        'OOP', 'Functional Programming',
      ], 'methodology'),
    ];
  }

  private static asCategory(
    terms: string[],
    category: KeywordCategory
  ): [string, KeywordCategory][] {
    return terms.map(t => [t, category]);
  }
}
