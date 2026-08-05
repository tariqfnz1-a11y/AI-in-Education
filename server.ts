import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Gemini safely
let aiInstance: GoogleGenAI | null = null;
function getAI() {
  if (!aiInstance) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not defined");
    }
    aiInstance = new GoogleGenAI({ apiKey });
  }
  return aiInstance;
}

const LESSON_PLAN_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    learningObjectives: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "3-4 clear, student-centered objectives using action verbs."
    },
    resources: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Practical classroom materials (low-cost and digital)."
    },
    teachingSteps: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          step: { type: Type.STRING },
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          activity: { type: Type.STRING },
          time: { type: Type.STRING }
        },
        required: ["step", "title", "description", "activity", "time"]
      },
      description: "4 structured steps: Warm-up, Concept Development, Follow-up, Wrap-up."
    },
    homework: {
      type: Type.STRING,
      description: "Simple, relevant practice task."
    },
    evaluation: {
      type: Type.STRING,
      description: "Quick assessment methods."
    },
    reflectionPrompts: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "2-3 reflective prompts for the teacher."
    },
    enhanced: {
      type: Type.OBJECT,
      properties: {
        quiz: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
          description: "3 quick quiz questions."
        },
        realLifeApplication: {
          type: Type.STRING,
          description: "1 real-life application example."
        },
        interactiveActivity: {
          type: Type.STRING,
          description: "1 interactive classroom activity."
        }
      }
    }
  },
  required: [
    "learningObjectives",
    "resources",
    "teachingSteps",
    "homework",
    "evaluation",
    "reflectionPrompts"
  ]
};

// API Routes
app.post("/api/generate-lesson-plan", async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: "Missing input in request body" });
    }

    const ai = getAI();
    const languageSelection = input.language || 'English';
    let languageRule = '5. Language: Simple and practical for a classroom.';
    if (languageSelection === 'Urdu') {
      languageRule = `5. Language & Script: You MUST generate all content strings in correct URDU (اردو) language. All text block content strings in the JSON response (learningObjectives, resources, teachingSteps step titles, step descriptions, step activities, homework, evaluation, reflectionPrompts, and enhanced section sub-fields) MUST be written in beautiful Urdu language using proper Urdu characters and script. Do NOT use romanized Urdu.`;
    } else if (languageSelection === 'Bilingual') {
      languageRule = `5. Language & Script: You MUST generate all text content in a BILINGUAL format (English combined with Urdu translation side-by-side or stacked). For each learning objective, resource item, step title, step description, step activity, homework, evaluation, reflection prompt, and enhanced section item, provide the English text followed by a slash ' / ' and then the Urdu translation in Urdu script. (Example: 'Learn the first law of thermodynamics. / تھرمو ڈائنامکس کے پہلے قانون کو سیکھنا۔')`;
    }

    const prompt = `
      Generate a complete, structured school lesson plan based on the following details:
      Class: ${input.className}
      Subject: ${input.subject}
      Topic: ${input.topic}
      Subtopic: ${input.subtopic}
      Difficulty Level: ${input.difficulty}
      Teaching Style: ${input.teachingStyle}
      Lesson Duration: ${input.duration}
      Enhanced Mode: ${input.enhanced ? "Active (Include quiz, real-life app, and interactive activity)" : "Inactive"}

      Follow these rules:
      1. Objectives: 3-4 clear, measurable (define, explain, solve, analyze).
      2. Resources: Practical tools (both low-cost and digital).
      3. Teaching Steps:
         - Generate 4 structured steps: Warm-up, Concept Development, Follow-up, Wrap-up.
         - The combined times for these steps MUST add up exactly to the total duration of ${input.duration}.
         - Distribute the time allocation logically across these 4 steps based on the teaching style.
      4. Duration: Total lesson duration is exactly ${input.duration}.
      ${languageRule}
      ${input.enhanced ? "6. Enhance: Provide 3 quiz questions, 1 real-life application, and 1 interactive activity." : ""}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: LESSON_PLAN_SCHEMA,
        temperature: 0.7,
      }
    });

    if (!response.text) {
      throw new Error("No response text received from Gemini");
    }

    const result = JSON.parse(response.text);
    const finalPlan = {
      ...result,
      class: input.className,
      subject: input.subject,
      date: input.date,
      periods: input.periods,
      duration: input.duration,
      topic: input.topic,
      subtopic: input.subtopic,
      language: languageSelection,
    };

    res.json(finalPlan);
  } catch (error: any) {
    console.error("Error generating lesson plan:", error);
    res.status(500).json({ error: error.message || "Failed to generate lesson plan" });
  }
});

app.post("/api/regenerate-section", async (req, res) => {
  try {
    const { section, currentInput, currentPlan } = req.body;
    if (!section || !currentInput || !currentPlan) {
      return res.status(400).json({ error: "Missing required parameters in request body" });
    }

    const ai = getAI();
    const languageSelection = currentInput.language || 'English';
    let languageRule = 'Provide the output in the same language style as requested.';
    if (languageSelection === 'Urdu') {
      languageRule = `Provide the output ENTIRELY IN URDU (اردو) language using proper Urdu characters and script. Do not use romanized Urdu.`;
    } else if (languageSelection === 'Bilingual') {
      languageRule = `Provide the output in BILINGUAL (English and Urdu) format using the 'English / Urdu' pattern.`;
    }

    const prompt = `
      Regenerate the "${section}" section of a lesson plan for:
      Subject: ${currentInput.subject}
      Topic: ${currentInput.topic} (Subtopic: ${currentInput.subtopic})
      Difficulty: ${currentInput.difficulty}
      Style: ${currentInput.teachingStyle}
      
      Current full plan context: ${JSON.stringify(currentPlan)}
      
      ${languageRule}
      
      Provide ONLY the specific output for the "${section}" section in JSON format matching the original schema for this property.
      Keep it fresh and different from the current version.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: LESSON_PLAN_SCHEMA,
      }
    });

    if (!response.text) {
      return res.status(500).json({ error: "No response text received from Gemini" });
    }

    const result = JSON.parse(response.text);
    res.json({ data: result[section] });
  } catch (error: any) {
    console.error("Error regenerating lesson plan section:", error);
    res.status(500).json({ error: error.message || "Failed to regenerate section" });
  }
});

// Vite middleware flow for full stack development and production
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
