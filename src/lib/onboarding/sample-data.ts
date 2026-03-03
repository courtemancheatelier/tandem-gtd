export const sampleAreas = [
  { name: "Sample: Health & Fitness", description: "Physical wellbeing, exercise, nutrition" },
  { name: "Sample: Career", description: "Professional growth, skills, networking" },
];

export const sampleProjects = [
  {
    title: "Sample: Plan Weekend Trip",
    type: "SEQUENTIAL" as const,
    outcome: "A relaxing weekend trip fully planned and booked",
    tasks: [
      { title: "Research destinations (2-3 options)" },
      { title: "Compare hotel prices and reviews" },
      { title: "Book accommodation" },
      { title: "Plan activities and restaurants" },
    ],
  },
  {
    title: "Sample: Home Office Setup",
    type: "PARALLEL" as const,
    outcome: "A comfortable, productive home workspace",
    tasks: [
      { title: "Order standing desk" },
      { title: "Buy monitor arm" },
      { title: "Set up better lighting" },
    ],
  },
];

export const sampleInboxItems = [
  { title: "Sample: Look into meal prep services" },
  { title: "Sample: Schedule dentist appointment" },
  { title: "Sample: Read that article Sarah recommended" },
];
