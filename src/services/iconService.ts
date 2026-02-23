import { GoogleGenAI } from "@google/genai";

export async function generateAppIcon() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        {
          text: 'A professional app icon for a ski tracking application called "SkiTrack Pro". The icon should feature a stylized mountain peak with a glowing emerald green path winding down it, representing a GPS track. Dark minimalist background, high contrast, sleek modern design, vector style, 1:1 aspect ratio.',
        },
      ],
    },
    config: {
      imageConfig: {
        aspectRatio: "1:1"
      }
    }
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:image/png;base64,${part.inlineData.data}`;
    }
  }
  return null;
}
