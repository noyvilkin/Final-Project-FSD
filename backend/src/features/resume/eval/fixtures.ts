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
  {
    id: 'mobile-developer',
    notes: 'Native + cross-platform mobile. Held-out domain — matches a mobile JD, weak match for web/data/devops.',
    text: `Noa Shapira
noa.shapira@example.com
Phone: +972-52-987-6543

EDUCATION
B.Sc. in Software Engineering, Ben-Gurion University, 2015 - 2019

EXPERIENCE
Senior Mobile Developer, Appwise (Feb 2021 - Present)
- Shipped native iOS features in Swift and SwiftUI for an app with 500k+ monthly users.
- Built Android screens in Kotlin using Jetpack Compose and an MVVM architecture.
- Integrated REST and GraphQL APIs and handled offline caching with Room and Core Data.
- Reduced app crash rate by 30% using Firebase Crashlytics and unit tests with XCTest.

Mobile Developer, PocketLabs (Jul 2019 - Jan 2021)
- Developed cross-platform features in React Native and TypeScript.
- Published releases to the App Store and Google Play and managed CI with Fastlane.

SKILLS
Swift, SwiftUI, Kotlin, Jetpack Compose, React Native, TypeScript, REST API,
GraphQL, Firebase, XCTest, Git, Fastlane

LANGUAGES
Hebrew (native), English (fluent)`,
  },
  {
    id: 'product-designer',
    notes: 'Non-engineering domain (UX/UI). Strong overfitting guard — extractor must not invent technical skills.',
    text: `Tamar Azoulay
tamar.azoulay@example.com

EDUCATION
B.Des. in Visual Communication, Bezalel Academy of Arts and Design, 2014 - 2018

EXPERIENCE
Senior Product Designer, Flowly (Mar 2021 - Present)
- Led end-to-end UX for a B2B SaaS dashboard used by 200+ enterprise clients.
- Built and maintained a design system in Figma adopted across 4 product teams.
- Ran usability testing and user interviews to validate design decisions.
- Partnered with product managers and engineers to ship features in two-week cycles.

Product Designer, BrandNest (Aug 2018 - Feb 2021)
- Designed responsive web and mobile interfaces using Figma and Sketch.
- Created wireframes, prototypes, and user flows for e-commerce clients.

SKILLS
Figma, Sketch, Adobe XD, Prototyping, Wireframing, User Research, Usability Testing,
Design Systems, Interaction Design, HTML, CSS

LANGUAGES
Hebrew, English`,
  },
  {
    id: 'marketing-manager',
    notes: 'Fully non-technical domain. Held-out — tests that the AI never fabricates engineering skills from a marketing resume.',
    text: `Yael Berger
yael.berger@example.com

EDUCATION
B.A. in Business Administration, IDC Herzliya, 2013 - 2016

EXPERIENCE
Digital Marketing Manager, GrowthHive (Jan 2020 - Present)
- Managed paid acquisition campaigns across Google Ads and Meta Ads with a $1.2M annual budget.
- Grew organic traffic 65% through SEO and content marketing strategy.
- Built marketing dashboards in Google Analytics and Looker Studio to track campaign ROI.
- Led a team of 4 marketers and coordinated with sales on lead generation.

Marketing Specialist, Brightline Media (Sep 2016 - Dec 2019)
- Executed email marketing campaigns with Mailchimp and HubSpot.
- Managed social media calendars and reported on engagement metrics.

SKILLS
SEO, SEM, Google Ads, Meta Ads, Google Analytics, Looker Studio, Content Marketing,
Email Marketing, HubSpot, Mailchimp, Campaign Management

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
  {
    id: 'mobile-engineer',
    notes: 'Mobile role — expected to match mobile-developer best, weak match for the others.',
    text: `Mobile Engineer (iOS/Android)

We are hiring a Mobile Engineer to build and maintain our consumer mobile apps.

Requirements:
- 3+ years of mobile development experience
- Strong proficiency in Swift for iOS development
- Experience with Kotlin for Android
- Familiarity with REST API integration
- Experience with automated testing (XCTest, JUnit)
- Comfortable with Git and CI/CD pipelines

Nice to Have:
- React Native or other cross-platform experience
- GraphQL knowledge
- Firebase and analytics tooling`,
  },
  {
    id: 'senior-product-designer',
    notes: 'Design role — expected to match product-designer best. Non-engineering; should be a weak match for all dev resumes.',
    text: `Senior Product Designer

We are looking for a Senior Product Designer to shape the experience of our SaaS platform.

Requirements:
- 4+ years of product design experience
- Expert proficiency with Figma
- Strong background in user research and usability testing
- Experience building and maintaining design systems
- Ability to create wireframes, prototypes, and user flows
- Close collaboration with product managers and engineers

Nice to Have:
- Motion and interaction design skills
- Familiarity with HTML and CSS
- Experience in B2B SaaS`,
  },
];
