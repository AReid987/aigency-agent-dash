/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- AGENT DEFINITIONS ---

// Define a common interface for all agents to ensure type safety.
interface Agent {
  name: string;
  basePrompt: string;
  config?: {
    responseMimeType: "application/json";
    responseSchema: any;
  };
  getElements: () => {
    card: HTMLElement | null;
    module: HTMLElement | null;
    content: HTMLElement | null;
  };
  processResponse: (response: GenerateContentResponse, contentEl: HTMLElement) => Promise<void> | void;
}

type AgentId = 'sentinel' | 'cipher' | 'pixel' | 'helios' | 'juno' | 'nomad';

const agents: Record<AgentId, Agent> = {
  sentinel: {
    name: 'Sentinel',
    basePrompt: "Generate a 10-line system health log. Include timestamps (HH:MM:SS), log levels (INFO, WARN, ERROR), and messages about CPU usage, memory status, and network traffic.",
    getElements: () => ({
      card: document.getElementById('agent-sentinel'),
      module: document.getElementById('module-sentinel'),
      content: document.querySelector<HTMLElement>('#module-sentinel .content-pre'),
    }),
    async processResponse(response: GenerateContentResponse, contentEl: HTMLElement) {
      typewriterEffect(response.text, contentEl);
    }
  },
  cipher: {
    name: 'Cipher',
    basePrompt: "Generate a JSON object representing user sentiment analysis. The schema should have three top-level keys: 'positive', 'negative', 'neutral'. Each key should contain a 'percentage' value (string, e.g., '65%') and a 'keywords' list (array of three relevant strings).",
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          positive: { type: Type.OBJECT, properties: { percentage: { type: Type.STRING }, keywords: { type: Type.ARRAY, items: { type: Type.STRING } } } },
          negative: { type: Type.OBJECT, properties: { percentage: { type: Type.STRING }, keywords: { type: Type.ARRAY, items: { type: Type.STRING } } } },
          neutral: { type: Type.OBJECT, properties: { percentage: { type: Type.STRING }, keywords: { type: Type.ARRAY, items: { type: Type.STRING } } } }
        }
      }
    },
    getElements: () => ({
      card: document.getElementById('agent-cipher'),
      module: document.getElementById('module-cipher'),
      content: document.querySelector<HTMLElement>('#module-cipher .content-pre'),
    }),
    async processResponse(response: GenerateContentResponse, contentEl: HTMLElement) {
      const jsonText = response.text;
      const formattedJson = JSON.stringify(JSON.parse(jsonText), null, 2);
      typewriterEffect(formattedJson, contentEl);
    }
  },
  pixel: {
    name: 'Pixel',
    basePrompt: "Generate an SVG for a simple mobile app login screen wireframe. It must be a complete SVG tag. Use a dark theme: transparent background, a light gray stroke color (like #888), and no fill. It should include a placeholder for a logo (a circle), two input fields (rectangles with rounded corners), and a login button (a rectangle with text 'LOGIN').",
    getElements: () => ({
      card: document.getElementById('agent-pixel'),
      module: document.getElementById('module-pixel'),
      content: document.getElementById('pixel-content'),
    }),
    async processResponse(response: GenerateContentResponse, contentEl: HTMLElement) {
      // Find the SVG within the response, as the model might add markdown.
      const svgMatch = response.text.match(/<svg.*?>.*?<\/svg>/s);
      contentEl.innerHTML = svgMatch ? svgMatch[0] : '<p>Error: No valid SVG received.</p>';
    }
  },
  helios: {
    name: 'Helios',
    basePrompt: "Generate a basic file structure for a web app as a nested list.",
    getElements: () => ({
      card: document.getElementById('agent-helios'),
      module: document.getElementById('module-helios'),
      content: document.querySelector<HTMLElement>('#module-helios .content-pre'),
    }),
    async processResponse(response: GenerateContentResponse, contentEl: HTMLElement) {
      typewriterEffect(response.text, contentEl);
    }
  },
  juno: {
    name: 'Juno',
    basePrompt: "Generate a 'hello world' function in Python.",
    getElements: () => ({
      card: document.getElementById('agent-juno'),
      module: document.getElementById('module-juno'),
      content: document.querySelector<HTMLElement>('#module-juno .content-pre'),
    }),
    async processResponse(response: GenerateContentResponse, contentEl: HTMLElement) {
      typewriterEffect(response.text, contentEl);
    }
  },
  nomad: {
    name: 'Nomad',
    basePrompt: "Generate a 3-point checklist for testing a login form.",
    getElements: () => ({
      card: document.getElementById('agent-nomad'),
      module: document.getElementById('module-nomad'),
      content: document.querySelector<HTMLElement>('#module-nomad .content-pre'),
    }),
    async processResponse(response: GenerateContentResponse, contentEl: HTMLElement) {
      typewriterEffect(response.text, contentEl);
    }
  }
};

interface MissionTask {
  agentId: AgentId;
  taskDescription: string;
  prompt: string;
}

// --- DOM ELEMENT SELECTORS ---
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const chatMessages = document.getElementById('chat-messages') as HTMLDivElement;
const progressBar = document.getElementById('progress-bar') as HTMLDivElement;
const progressText = document.getElementById('progress-text') as HTMLSpanElement;
const missionStatusText = document.getElementById('mission-status-text') as HTMLSpanElement;
const currentObjectiveText = document.getElementById('current-objective') as HTMLHeadingElement;

let isMissionRunning = false;

// --- UI HELPER FUNCTIONS ---

function addMessage(text: string, sender: 'user' | 'ai') {
    const messageEl = document.createElement('div');
    messageEl.classList.add('message', `${sender}-message`);
    messageEl.textContent = text;
    chatMessages.appendChild(messageEl);
    chatMessages.scrollTop = chatMessages.scrollHeight; // Auto-scroll
    return messageEl;
}

function showLoading(contentEl: HTMLElement) {
    contentEl.innerHTML = `<div class="loading-dots"><span>.</span><span>.</span><span>.</span></div>`;
}

function typewriterEffect(text: string, element: HTMLElement, speed: number = 10) {
  let i = 0;
  element.innerHTML = '';
  function type() {
    if (i < text.length) {
      element.innerHTML += text.charAt(i);
      i++;
      setTimeout(type, speed);
    }
  }
  type();
}

function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// --- CORE LOGIC ---

async function runAgentTask(task: MissionTask, index: number, totalTasks: number) {
  // The agentId from the orchestrator might be capitalized.
  // Convert it to lowercase to match the keys in our `agents` object.
  const agentId = (task.agentId as string).toLowerCase() as AgentId;
  const agent = agents[agentId];

  if (!agent) {
    // Log the original value from the API for easier debugging.
    console.error(`Unknown agent ID: ${task.agentId}`);
    addMessage(`Error: Could not find an agent with ID "${task.agentId}". Skipping task.`, 'ai');
    return;
  }
  
  const { card, module, content } = agent.getElements();
  if (!card || !module || !content) {
      console.error(`Could not find UI elements for agent ${agentId}`);
      return;
  };

  missionStatusText.textContent = `TASKING AGENT: ${agent.name.toUpperCase()}`;
  addMessage(`Executing: ${task.taskDescription}`, 'ai');
  card.classList.add('active');
  module.classList.add('active');
  showLoading(content);

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: task.prompt,
      ...(agent.config && { config: agent.config })
    });
    
    await agent.processResponse(response, content);

  } catch (error) {
    console.error(`Error with agent ${agent.name}:`, error);
    content.textContent = `Error: Agent ${agent.name} failed to respond.`;
  } finally {
    card.classList.remove('active');
    module.classList.remove('active');
    card.classList.add('complete');
    module.classList.add('complete');
    
    const progress = Math.round(((index + 1) / totalTasks) * 100);
    progressBar.style.width = `${progress}%`;
    progressText.textContent = `${progress}% COMPLETE`;
  }
}

async function handleChatSubmit(event: SubmitEvent) {
  event.preventDefault();
  if (!chatInput.value.trim() || isMissionRunning) return;

  const userGoal = chatInput.value.trim();
  isMissionRunning = true;
  setUiState(true);
  
  // 1. Reset UI and display user message
  resetUi();
  addMessage(userGoal, 'user');
  currentObjectiveText.textContent = `OBJECTIVE: ${userGoal}`;
  chatInput.value = '';
  await delay(500);

  const thinkingMessage = addMessage('...', 'ai');
  
  try {
    // 2. AI Planner/Orchestrator Step
    const planningPrompt = `You are an AI project manager for "Aigency". A user has a goal: "${userGoal}". Your job is to break this down into a sequence of actionable tasks. For each task, select the most appropriate specialist AI agent from the available team and create a concise task description and a detailed, self-contained prompt for that agent to execute.

    Available Agents and their specializations:
    - sentinel (Platform Engineer): Infrastructure, logs, server status, deployment, backend configuration.
    - cipher (Data Analyst): Data analysis, logic, JSON structures, algorithms.
    - pixel (UX Engineer): Visual elements, UI/UX wireframes, SVG, CSS.
    - helios (System Architect): High-level planning, system design, tech stack choices, file structure.
    - juno (Code Weaver): Generating boilerplate code, functions, components, scripts.
    - nomad (QA Specialist): Test plans, identifying edge cases, quality assurance, user feedback simulation.

    RULES:
    - The plan should have at least 2 tasks and at most 6.
    - Choose the best agent for each task based on their specialization. You can use an agent more than once.
    - The sequence of tasks must be logical.
    - The 'agentId' in the output JSON MUST be one of the lowercase IDs listed above.
    - Generate a JSON object that follows the specified schema.`;
    
    const planningResponse = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: planningPrompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tasks: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  agentId: { type: Type.STRING },
                  taskDescription: { type: Type.STRING },
                  prompt: { type: Type.STRING },
                },
                required: ["agentId", "taskDescription", "prompt"]
              },
            },
          },
          required: ["tasks"]
        },
      },
    });

    const missionPlan = JSON.parse(planningResponse.text);
    const tasks: MissionTask[] = missionPlan.tasks;
    
    if (!tasks || tasks.length === 0) {
      throw new Error("Failed to generate a mission plan.");
    }
    
    // 3. Announce plan and execute tasks
    const planText = "Objective received. Orchestrating mission plan:\n" + tasks.map((t, i) => `${i+1}. ${t.taskDescription} (Agent: ${t.agentId})`).join('\n');
    thinkingMessage.textContent = planText;
    
    missionStatusText.textContent = 'MISSION IN PROGRESS';
    await delay(1000);

    for (let i = 0; i < tasks.length; i++) {
      await runAgentTask(tasks[i], i, tasks.length);
      await delay(500);
    }

    missionStatusText.textContent = 'MISSION COMPLETE';
    addMessage('All tasks complete. Awaiting new objective.', 'ai');
    
  } catch(error) {
      console.error("Mission failed:", error);
      const errorMessage = `Mission failed. Orchestrator could not generate a valid plan. Please try a different objective.`;
      thinkingMessage.textContent = errorMessage;
      missionStatusText.textContent = 'MISSION FAILED';
  } finally {
      isMissionRunning = false;
      setUiState(false);
  }
}

function setUiState(isRunning: boolean) {
    isMissionRunning = isRunning;
    chatInput.disabled = isRunning;
    sendBtn.disabled = isRunning;
}

function resetUi() {
    progressBar.style.width = '0%';
    progressText.textContent = '0% COMPLETE';
    Object.values(agents).forEach(agent => {
        const { card, module, content } = agent.getElements();
        card?.classList.remove('active', 'complete');
        module?.classList.remove('active', 'complete');
        if (content) content.innerHTML = '';
    });
}

// Initial welcome message
window.addEventListener('load', () => {
    addMessage("Welcome to the Aigency Collaboratory. Please describe your mission objective.", "ai");
});

chatForm.addEventListener('submit', handleChatSubmit);