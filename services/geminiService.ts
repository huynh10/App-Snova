import { GoogleGenAI, Type } from "@google/genai";
import { TaskPriority } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Giữ lại hàm cũ nếu cần, nhưng bài toán yêu cầu thay đổi logic voice thành nhập liệu
// Chúng ta sẽ sửa analyzeTaskAudio để nó trả về text thuần túy (Dictation)

export const analyzeTaskAudio = async (audioBase64: string, mimeType: string): Promise<string | null> => {
  try {
    const model = 'gemini-2.5-flash';
    // Prompt yêu cầu chép lại lời nói chính xác
    const prompt = `
      Hãy nghe đoạn âm thanh này và chép lại chính xác những gì người nói đang nói thành văn bản tiếng Việt. 
      Không thêm bớt, không phân tích, chỉ trả về nội dung văn bản thuần túy (Transcription).
    `;

    const response = await ai.models.generateContent({
      model: model,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: mimeType,
              data: audioBase64
            }
          },
          { text: prompt }
        ]
      }
    });

    const text = response.text;
    if (!text) return null;
    return text.trim();
  } catch (error) {
    console.error("Gemini Voice API Error:", error);
    return null;
  }
};
