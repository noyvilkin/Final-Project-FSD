import type { ProfileAnalysisEvalSample } from "./profile-analysis.eval.types.js";

export const PROFILE_ANALYSIS_EVAL_SAMPLES: ProfileAnalysisEvalSample[] = [
  {
    id: "resume-01-dan-feithlicher",
    description: "Senior full stack developer with 7+ years of experience",
    resumeText: `
Dan Feithlicher
Senior Software Developer
Email: d.feithlicher@gmail.com
Tel: +972549794215
LinkedIn: https://www.linkedin.com/in/dan-feithlicher

Senior Full Stack Developer with 7+ years of experience architecting, building, and scaling high-performance web applications and systems.
Passionate about innovation, system architecture and optimization.
Proven ability to lead teams, mentor developers, and deliver impactful solutions.

Work Experience

Senior Full Stack Developer, WeSki, 2023 – 2025
Built and maintained a high-traffic booking platform serving tens of thousands of users daily.
Used algorithms to create personalized travel packages by integrating suppliers and API providers.
Led the end-to-end development and integration of third-party APIs, including Booking.com and Car Rental APIs.
Designed and implemented scalable infrastructure providing a unified interface for adding new API providers.
Designed and implemented cross-services A/B testing infrastructure.
Developed a permission management system with granular access control.
Developed scalable solutions with Node.js, TypeScript, React, Next.js, PostgreSQL, and MongoDB.
Used AWS services including EC2, ECS, S3, Lambda, RDS, CloudWatch, CodePipeline, ELB, and SQS.
Used Terraform, Prometheus, Datadog, and Grafana.

Software Development Team Lead, Ministry of Defense, 2020 – 2023
Led three software development teams developing web applications and command and control systems.
Programmed in Node.js, React, Python, C#, and TypeScript.
Focused on backend web server development and microservices based on DDS communication protocol.
Managed Scrum methodology, sprint planning, task tracking, retrospectives, and code reviews.
Collaborated with cross-functional teams from IDF software units and industry leaders such as Elbit Systems.

Full Stack Developer, Ministry of Defense, 2018 – 2020
Developed award-winning BI system for tank data analysis using React.js, C#, Python, ASP.NET, and SQL Server.
Built command-and-control system for tank drivers.
Implemented mapping capabilities and video streaming.

Education
Bachelor's Degree: Computer Science, 2019 – 2022
The Collage of Management Academic Studies
Specialization in deep learning and neural networks
Grade: 94

Mamram Course Graduate: Software and Web Development, 2018
Mamram IDF - School of Computer Professions - Ramat Gan

Technician: Computer Software, 2017 - 2018
ORT Colleges - Tel Aviv

Accomplishments
Chief of Staff's Award for an innovative project in the field of economic efficiency.
Excellence scholarship on technological development and innovation.
`,
    expected: {
      candidateName: "Dan Feithlicher",
      candidateEmail: "d.feithlicher@gmail.com",
      profileSummary: {
        hasDegree: true,
        highestDegree: "Bachelor's Degree",
        fieldOfStudy: "Computer Science",
        institution: "The Collage of Management Academic Studies",
        gradeAverage: 94,
        totalYearsOfExperience: 7,
        lastRoleTitle: "Senior Full Stack Developer",
        lastRoleCompany: "WeSki",
        topSkills: [
          "Node.js",
          "TypeScript",
          "React",
          "AWS",
          "System Architecture"
        ],
        recommendedCourses: [
          "Advanced System Design",
          "Cloud Architecture with AWS",
          "Microservices Architecture",
          "Advanced DevOps with Terraform",
          "Engineering Leadership"
        ]
      }
    }
  },
  {
    id: "resume-02-yuval-nurlian",
    description: "Full-stack information systems developer with enterprise systems experience",
    resumeText: `
Yuval Nurlian
Full-Stack Developer
Phone: 0548119777
Email: Yuvalnur5@gmail.com
Location: Yehud - Monosson

Full-Stack Developer with over 2 years of hands-on experience developing and maintaining enterprise web applications end-to-end.
Experienced in translating business requirements into scalable technical solutions, with strong ownership, problem-solving skills, and a fast learning curve.
Comfortable working across frontend, backend, and databases, and delivering production systems used daily by real users.

Primary Professional Experience

Israel Aerospace Industries
Full-Stack Information Systems Developer
2023 - Present

This is the candidate's main current professional role.

Full ownership of end-to-end development of enterprise information systems, from requirements analysis and system design to production deployment and ongoing maintenance.
Close collaboration with internal stakeholders to gather business requirements, define specifications, and translate needs into technical solutions.
Design and development of relational databases using Oracle SQL, including schema design, data modeling, and complex SQL queries.
Development of backend services and business logic using C# and .NET Framework.
Development and maintenance of frontend applications using Angular, TypeScript, HTML, and CSS.
Delivery and maintenance of production systems used daily by employees across multiple organizational units.
Dynamic adaptation of development focus per project, covering data architecture, backend, or frontend as required.
Execution of functional testing, bug fixing, version releases, and continuous post-deployment improvements.
Ongoing system support, feature extensions, and long-term maintenance throughout the system lifecycle.

Freelance / Independent Projects
Developed a final project product exchange platform with ML-based matching and Gemini API integration.
Designed and developed an initial prototype of a subscription management application, including UX/UI design in Figma.

Additional Non-Technical Experience
Private Mathematics Tutor
2024 - Present
One-on-one mathematics tutoring for middle and high school students, including preparation for matriculation exams.

Military Service
Technological Instructor - Technology and Maintenance Corps
2017 - 2020
Conducted professional technical training for soldiers, including instruction on artillery support systems and maintenance.
Trained personnel in fault diagnosis and troubleshooting in field and workshop environments.
The role required strong technical proficiency, leadership, and instructional capabilities.

Education
B.Sc. in Computer Science
2022 - 2025
Afeka College of Engineering, Tel Aviv

Relevant Coursework:
Algorithms – 100
Data Structures – 99
Software Engineering – 94
Machine Learning – 98
Databases – 90

Additional Training
The Complete SQL Bootcamp, Udemy
UX/UI Design Course, IAI Academy

Skills
Frontend: Angular, TypeScript, HTML, CSS
Backend: C#, .NET Framework, Node.js
Databases: Oracle SQL
Programming Languages: Java, C, C++
Languages: English excellent, Hebrew native
`,
    expected: {
      candidateName: "Yuval Nurlian",
      candidateEmail: "Yuvalnur5@gmail.com",
      profileSummary: {
        hasDegree: true,
        highestDegree: "B.Sc.",
        fieldOfStudy: "Computer Science",
        institution: "Afeka College of Engineering",
        gradeAverage: null,
        totalYearsOfExperience: 2,
        lastRoleTitle: "Full-Stack Information Systems Developer",
        lastRoleCompany: "Israel Aerospace Industries",
        topSkills: [
          "Angular",
          "TypeScript",
          "C#",
          ".NET Framework",
          "Oracle SQL"
        ],
        recommendedCourses: [
          "Advanced Angular",
          "Advanced .NET Backend Development",
          "Oracle SQL Performance Tuning",
          "Enterprise System Architecture",
          "Production System Maintenance"
        ]
      }
    }
  },
  {
    id: "resume-03-shay-liebling",
    description: "Developer and computer science student with startup and web development experience",
    resumeText: `
SHAY LIEBLING
Developer
Email: shayliebling3520@gmail.com
Phone: 054-3063054
LinkedIn: www.linkedin.com/in/shay-liebling
GitHub: https://github.com/shay3520

Profile
Motivated computer science student with a passion for excellence and a strong work ethic.
Currently pursuing a dual-degree in Computer Science and Entrepreneurship at Reichman University.
Seeking a student position as a Developer.

Education
B.Sc. – Computer Science and Entrepreneurship
Reichman University (IDC Herzliya)
2021 - 2024

Mekif Yehud High School
Computer Science 5 units, Math 5 units, English 5 units
2014 - 2017

Professional Experience

Co-Founder & App Developer at Sublet Me
2023 - Present
Co-founded "Sublet Me," a startup aimed at innovating the sublet market.
Currently developing the MVP app, focusing on user-friendly features and efficient functionality.
Leveraging expertise in modern app development technologies to create a platform that simplifies and enhances the subletting process.
Collaboratively working on business strategy and app design to meet the unique needs of the sublet market.

Web Development Business Owner
2023 - Present
Specialize in designing and developing custom websites for businesses, enhancing their online presence.
Deliver end-to-end web solutions, from concept to deployment, with a focus on responsive design and user experience.
Work closely with clients to understand their business needs, translating them into effective web strategies.
Use HTML, CSS, JavaScript, and modern frameworks to create high-quality, scalable websites.

Self-Employed Private Tutor and Course Developer
2020 - 2022
Effectively taught and managed math courses, including psychometric exam preparation.
Grew tutoring business by 50% in the first year, maintaining high client satisfaction.
Implemented marketing strategies, achieving a 35% revenue increase over two years.
Managed business operations.

Military Service
Served as a Military Police Investigator, 2017 - 2020.

Technical Profile
Languages and Technologies: Python, JavaScript, HTML5, CSS, Node.js, SQL, MongoDB, React, C#, Java.
Front-End Development: HTML, CSS, JavaScript, React.js.
Back-End Development: Server-side logic, SQL, MongoDB.
Web Technologies: Modern development tools.
Project Management: Agile environments and Git.

Certifications
The Complete 2023 Web Development Bootcamp, Udemy.
The Ultimate MySQL Bootcamp, Udemy.
JavaScript: The Advanced Concepts, Udemy.
React Native: Mobile App Development, Udemy.
`,
    expected: {
      candidateName: "SHAY LIEBLING",
      candidateEmail: "shayliebling3520@gmail.com",
      profileSummary: {
        hasDegree: true,
        highestDegree: "B.Sc.",
        fieldOfStudy: "Computer Science and Entrepreneurship",
        institution: "Reichman University",
        gradeAverage: null,
        totalYearsOfExperience: 4,
        lastRoleTitle: "Co-Founder & App Developer",
        lastRoleCompany: "Sublet Me",
        topSkills: [
          "JavaScript",
          "React",
          "Node.js",
          "MongoDB",
          "SQL"
        ],
        recommendedCourses: [
          "Advanced React",
          "React Native Mobile Development",
          "Backend Development with Node.js",
          "Startup Product Management",
          "Advanced SQL"
        ]
      }
    }
  },
  {
    id: "resume-04-vered-sivan-abramovich",
    description: "Computer science student with instructional project management and technology training experience",
    resumeText: `
Vered Sivan Abramovich
Email: vered054819@gmail.com
Phone: +972-54-4733679

Motivated Computer Science student with extensive experience in training, instructional program management, and implementation of learning systems in organizations.
Strong analytical and organizational skills, a high technical aptitude, and excellent interpersonal abilities.
Fast learner with proven ability to work across technical interfaces.

Professional Experience

Instructional Project Manager | IAI – Israel Aerospace Industries
March 2025 – Present
Managing instructional projects in the aerospace engineering domain, including schedule planning, budgeting, and requirements analysis in collaboration with engineers and project managers.
Identifying knowledge gaps and implementing data-driven improvements based on ongoing user feedback.
Coordinating between development, training, and management teams to integrate learning systems and manage complex processes.
Holds a valid Security Clearance.

Technology Instructor | Ministry of Defense
August 2023 – February 2025
Led the onboarding and instruction for a new simulator system, tailored to the trainees’ needs.
Managed performance reports and debriefings to identify improvement opportunities.
Collaborated with international partners and external entities to enhance system capabilities.

Military Service
Simulator Trainer | Israeli Navy – Flotilla 13 (Shayetet 13)
September 2020 – May 2023
Delivered professional training for operational simulators.
Led a team of instructors and managed daily training activities.
Mentored and guided new instructors.
Analyzed monthly performance reports and derived actionable operational insights.
Awarded the Israeli Navy Commander’s Excellence Award for Independence Day 2022.

Education

Current Education
B.Sc. in Computer Science | The College of Management Academic Studies – Rishon LeZion
2024 – 2026 Expected
This is the candidate's current main academic degree.
Core Courses: Introduction to Programming C/C++, Discrete Mathematics, Data Structures, Mathematical Logic
Skills Acquired: Logical thinking, problem-solving, object-oriented programming, algorithmic development

Previous Education
Industrial Engineering and Management Diploma | Ministry of Education
2020
Full Matriculation Certificate with honors – 5 units in Physics and Mathematics
Completed 10 academic units including a final project in operations and production management
`,
    expected: {
      candidateName: "Vered Sivan Abramovich",
      candidateEmail: "vered054819@gmail.com",
      profileSummary: {
        hasDegree: true,
        highestDegree: "B.Sc.",
        fieldOfStudy: "Computer Science",
        institution: "The College of Management Academic Studies",
        gradeAverage: null,
        totalYearsOfExperience: 4,
        lastRoleTitle: "Instructional Project Manager",
        lastRoleCompany: "IAI – Israel Aerospace Industries",
        topSkills: [
          "Instructional Project Management",
          "Training",
          "Requirements Analysis",
          "Learning Systems",
          "C/C++"
        ],
        recommendedCourses: [
          "Project Management for Technology Teams",
          "Learning Systems Implementation",
          "Advanced Data Structures",
          "Software Engineering Fundamentals",
          "Requirements Engineering"
        ]
      }
    }
  }
];