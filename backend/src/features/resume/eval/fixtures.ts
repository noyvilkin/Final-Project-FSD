/**
 * Inline fixtures for the resume-feature evaluation harness.
 *
 * The eval intentionally uses raw resume *text* (not PDFs) so the
 * evaluation focuses on the AI behavior — DNA extraction quality and
 * bullet-rewrite faithfulness — independent of PDF-parsing artifacts.
 */

export interface ResumeFixture {
  id: string;
  /** Plain-text resume contents fed into the DNA extractor. */
  text: string;
  /** Optional notes for the report (kind of resume, why it was chosen). */
  notes?: string;
}

export interface JDFixture {
  id: string;
  text: string;
  notes?: string;
}

// ── Resume fixtures ─────────────────────────────────────────────────

export const RESUME_FIXTURES: ResumeFixture[] = [
  {
    id: 'junior-fullstack',
    notes: 'Recent CS graduate, web-app focus. Should match a full-stack JD well.',
    text: `Maya Cohen
Email: maya.cohen@example.com
Phone: +972-50-123-4567

EDUCATION
B.Sc. in Computer Science, Tel Aviv University, 2020 - 2023
GPA: 3.7

EXPERIENCE
Junior Full-Stack Developer, BrightApp Ltd. (Jul 2023 - Present)
- Built customer-facing dashboards in React and TypeScript using Vite and Tailwind CSS.
- Developed REST APIs in Node.js with Express and integrated MongoDB collections.
- Wrote unit tests with Jest covering authentication and billing flows.
- Deployed services to AWS EC2 behind an Nginx reverse proxy.

Software Engineering Intern, CodeNest (Jul 2022 - Sep 2022)
- Implemented React components for an internal admin tool.
- Fixed bugs in a Node.js + Express data-ingestion service.
- Pair-programmed with senior engineers on Git workflows and code review.

SKILLS
JavaScript, TypeScript, React, Node.js, Express, MongoDB, REST API,
Jest, Git, HTML, CSS, Tailwind CSS, AWS EC2, Linux

LANGUAGES
Hebrew (native), English (fluent)`,
  },
  {
    id: 'data-analyst',
    notes: 'Mid-level analyst, SQL/Python heavy. Should match a data JD better than a web JD.',
    text: `Daniel Levi
daniel.levi@example.com

EDUCATION
B.A. in Statistics, Hebrew University of Jerusalem, 2017 - 2020

EXPERIENCE
Data Analyst, FinScope Analytics (Mar 2021 - Present)
- Built daily revenue dashboards in Tableau used by 40+ stakeholders.
- Wrote SQL queries against PostgreSQL and Snowflake to power KPI reports.
- Automated weekly Excel reports with Python scripts using pandas.
- Partnered with product managers to define metrics for new features.

Junior Analyst, RetailGrid (Aug 2020 - Feb 2021)
- Cleaned and validated CSV exports from internal ERP systems.
- Built basic SQL views for the marketing team.

SKILLS
SQL, PostgreSQL, Snowflake, Python, pandas, NumPy, Tableau, Excel,
Statistics, Data Visualization, A/B Testing

LANGUAGES
Hebrew, English`,
  },
  {
    id: 'devops-engineer',
    notes: 'DevOps/cloud focus. Different domain from the rest — useful for "weak match" cases.',
    text: `Roni Bar
roni.bar@example.com

EDUCATION
B.Sc. in Information Systems, Reichman University, 2016 - 2019

EXPERIENCE
DevOps Engineer, CloudFort (Jan 2022 - Present)
- Managed AWS infrastructure (EC2, S3, RDS, IAM) for 30+ microservices.
- Authored Terraform modules for repeatable VPC and EKS provisioning.
- Built CI/CD pipelines in GitHub Actions deploying Docker images to ECR.
- Operated Kubernetes clusters using Helm charts and ArgoCD.

Systems Engineer, NetCore Israel (Sep 2019 - Dec 2021)
- Maintained Linux servers and Bash automation scripts.
- Configured Jenkins pipelines for legacy Java services.

SKILLS
AWS, EC2, S3, Terraform, Docker, Kubernetes, Helm, ArgoCD, GitHub Actions,
Jenkins, Bash, Linux, Nginx, Prometheus, Grafana

LANGUAGES
Hebrew, English`,
  },
];

// ── JD fixtures ─────────────────────────────────────────────────────

export const JD_FIXTURES: JDFixture[] = [
  {
    id: 'senior-fullstack',
    notes: 'Senior full-stack role — expected to match junior-fullstack the most.',
    text: `Senior Full-Stack Engineer

We are looking for a Senior Full-Stack Engineer to join our growing engineering team.
You will design, build, and maintain scalable web applications.

Requirements:
- 4+ years of professional software development experience
- Strong proficiency in TypeScript and JavaScript
- Production experience with React on the frontend
- Backend experience with Node.js (Express or NestJS)
- Solid experience with MongoDB
- Familiarity with REST API design
- Experience writing tests with Jest
- Comfortable working with Git, code review, and Agile workflows
- Hands-on experience with Docker and AWS (EC2, S3)

Nice to Have:
- Experience with Tailwind CSS or modern CSS frameworks
- CI/CD pipelines (GitHub Actions)
- GraphQL knowledge`,
  },
  {
    id: 'senior-data-engineer',
    notes: 'Data role — expected to match data-analyst best, weak match for the others.',
    text: `Senior Data Engineer

We are seeking a Senior Data Engineer to build and operate the analytical platform powering business intelligence across the company.

Requirements:
- 4+ years of experience working with relational databases (PostgreSQL, Snowflake, BigQuery)
- Advanced SQL proficiency
- Strong Python skills, especially with pandas and data-pipeline tooling
- Experience designing dashboards in Tableau or Looker
- Familiarity with A/B testing and experimentation frameworks
- Comfortable collaborating with product managers and analysts
- Experience automating ETL workflows

Nice to Have:
- Airflow, dbt, or similar pipeline orchestration tools
- Cloud data warehousing experience
- Statistics background`,
  },
];
