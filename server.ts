import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '25mb' }));

// Initialize GoogleGenAI server-side client
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!process.env.GEMINI_API_KEY,
    time: new Date().toISOString(),
  });
});

// Resilient helper with fallback for high-demand spikes
async function generateWithFallback(params: {
  model?: string;
  fallback?: string;
  contents: any;
  config?: any;
}) {
  const primary = params.model || 'gemini-3.8-flash';
  const secondary = params.fallback || 'gemini-3.8-flash';
  try {
    return await ai.models.generateContent({
      model: primary,
      contents: params.contents,
      config: params.config,
    });
  } catch (err: any) {
    if (primary !== secondary) {
      console.warn(`[Gemini Resilient] ${primary} encountered error (${err.message}). Falling back to ${secondary}...`);
      return await ai.models.generateContent({
        model: secondary,
        contents: params.contents,
        config: params.config,
      });
    }
    throw err;
  }
}

/**
 * Question Detection & Deduplication Endpoint
 * Analyzes continuous speech to identify if it's an interview question
 * Returns confidence score (0 - 100)
 */
app.post('/api/detect-question', async (req, res) => {
  try {
    const { transcript, existingQuestions = [] } = req.body;
    if (!transcript || transcript.trim().length < 4) {
      return res.json({ isQuestion: false, reason: 'Too short', confidence: 0 });
    }

    const response = await generateWithFallback({
      model: 'gemini-3.1-flash-lite',
      fallback: 'gemini-3.8-flash',
      contents: `You are an AI interview co-pilot filter. Analyze the following spoken transcript from an interview room:
"${transcript}"

Existing recent questions in this session:
${JSON.stringify(existingQuestions.slice(-5))}

Task:
1. Determine if this transcript contains a substantive interview question asked by the interviewer to the candidate.
2. If it is casual chit-chat, candidate's own response, filler words, or incomplete fragment, set isQuestion=false.
3. If it is an interview question, extract the clean, well-punctuated question in Thai or English as asked, and CRITICALLY: insert Thai phonetic readings for any technical terms or English words directly into the question (e.g. "Kubernetes (คูเบอร์เนติส)", "Agile (อะไจล)").
4. Calculate confidence as an integer score from 0 to 100 (e.g. 95 for explicit direct questions, 70 for implicit questions, 20 for unclear fragments).
5. Check if it is essentially a duplicate of any recent existing question.

Respond in JSON format:
{
  "isQuestion": boolean,
  "cleanQuestion": string,
  "confidence": number,
  "category": "technical" | "behavioral" | "background" | "situational" | "salary_culture" | "other",
  "isDuplicate": boolean,
  "intent": string
}`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isQuestion: { type: Type.BOOLEAN },
            cleanQuestion: { type: Type.STRING },
            confidence: { type: Type.INTEGER },
            category: { type: Type.STRING },
            isDuplicate: { type: Type.BOOLEAN },
            intent: { type: Type.STRING },
          },
          required: ['isQuestion', 'cleanQuestion', 'confidence', 'isDuplicate'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json(parsed);
  } catch (error: any) {
    console.error('Error in /api/detect-question:', error);
    res.status(500).json({ error: error.message || 'Detection failed', confidence: 0 });
  }
});

/**
 * Stream Interview Coaching & Smart Answer
 * Delivers structured response progressively via Server-Sent Events (SSE)
 * Includes prominent Risk Level, Risk Summary, and Phonetic Thai Pronunciation guide
 */
app.post('/api/analyze-question-stream', async (req, res) => {
  const {
    question,
    context = {},
    mode = 'balanced', // 'fast' | 'balanced' | 'deep'
    useSearch = false,
    isQuickStudy = false,
      tone = 'balanced', // 'Assertive' | 'Consultative' | 'Concise'
  } = req.body;

  if (!question) {
    return res.status(400).json({ error: 'Question is required' });
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  try {
    const {
      role = 'Senior Software Engineer / Candidate',
      targetCompany = 'Tech Company',
      companyWebsiteUrl = '',
      companyLinkedInUrl = '',
      resume = '',
      jd = '',
      coverLetter = '',
      pastQAs = [],
    } = context;

    const chosenSpeed = req.body.speed || req.body.mode || 'balanced';

    // Model selection based on requirements
    let selectedModel = 'gemini-3.1-flash-lite';
    let thinkingConfig = undefined;
    let tools: any[] | undefined = undefined;

    if (chosenSpeed === 'fast') {
      selectedModel = 'gemini-3.1-flash-lite';
    } else if (chosenSpeed === 'deep') {
      selectedModel = 'gemini-4-argon';
      thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
    } else {
      // balanced mode
      selectedModel = 'gemini-3.1-flash-lite';
      if (useSearch) {
        tools = [{ googleSearch: {} }];
      }
    }

    const systemInstruction = `คุณคือ Realtime Livestream Interview AI Assistant มืออาชีพ ระดับ Executive Coach และ Tech Lead มีเป้าหมายสูงสุดคือ "ช่วยให้ผู้ใช้ตอบคำถามสัมภาษณ์ได้อย่างฉลาด ชัดเจน ตรงประเด็น เป็นธรรมชาติ และสอบผ่าน 100%"
${isQuickStudy ? `
กฎการตอบโจทย์ Quick Study (โหมดด่วนพิเศษ):
- ตอบเฉพาะ bullet points ที่จำเป็นที่สุดเท่านั้น
- ตัด STAR format และเนื้อหาคำแนะนำยาวๆ ออกทั้งหมด
- สรุปให้ punchy ตรงประเด็นและนำไปพูดได้ทันที` : `
กฎเหล็กด้านภาษาและการแสดงผล:
- ต้องใช้ภาษาไทยระดับมืออาชีพ เป็นธรรมชาติ สละสลวย อ่านง่าย เข้าใจทันที ไม่ใช้คำพูดแปลกๆ สำนวนแปลคอมพิวเตอร์ที่งง หรือคำพูดหุ่นยนต์เด็ดขาด
- ทุกคำตอบและตัวอย่างบทพูด (Spoken Script) ต้องมีความมั่นใจ น่าเชื่อถือ และสะท้อนทักษะระดับ Senior
- ศัพท์เทคนิคหรือคำภาษาอังกฤษทุกคำ ต้องใส่คำอ่านภาษาไทยให้ถูกต้องและชัดเจนเสมอ เช่น Kubernetes (คูเบอร์เนติส), TypeScript (ไทป์สคริปต์), Docker (ด็อกเกอร์)`}}

บริบทผู้สมัครและบริษัทเป้าหมาย:
- ตำแหน่งที่สัมภาษณ์ (Target Role): ${role}
- บริษัทเป้าหมาย (Target Company): ${targetCompany}
${companyWebsiteUrl ? `- เว็บไซต์บริษัท: ${companyWebsiteUrl}` : ''}
${companyLinkedInUrl ? `- โปรไฟล์ LinkedIn บริษัท: ${companyLinkedInUrl}` : ''}
- รายละเอียด Job Description (JD) ที่สมัคร:
${jd || 'ไม่ได้ระบุ ผู้สมัครสมัครตำแหน่งระดับมืออาชีพ'}
- ข้อมูล Resume / ประวัติการทำงานของผู้สมัคร:
${resume || 'ไม่ได้ระบุ ผู้สมัครมีประสบการณ์และความมุ่งมั่น'}
- Cover Letter / Key Highlights:
${coverLetter || 'พร้อมเริ่มงาน มีความรับผิดชอบสูง'}

หน้าที่ของคุณเมื่อได้รับคำถามสัมภาษณ์:
1. ประเมินระดับความเสี่ยงของคำถาม (Risk Level): ระบุ "HIGH", "MEDIUM", หรือ "LOW"
2. สรุปความเสี่ยงและกับดักใน 1 ประโยค (Risk Summary): เช่น "ระวังการตอบกว้างเกินไป หรือวิจารณ์ทีมเก่าจนดูเป็นคนทำงานร่วมกับผู้อื่นยาก"
3. คำตอบที่ถูกต้อง (The Right Answer): 1-2 ประโยคสั้นตรงจุด ทรงพลัง ให้ผู้สมัครพูดเปิดได้ทันทีใน 10 วินาทีแรก และต้องแทรกคำอ่านศัพท์เทคนิคภาษาไทยทันที
4. การยกตัวอย่างคำพูดจริง (Example Spoken Script): ตัวอย่างคำพูดจริง (Verbatim Script) แบบจำลองสถานการณ์จริงที่มีตัวเลขหรือผลลัพธ์เป็นรูปธรรม และต้องแทรกคำอ่านศัพท์เทคนิคภาษาไทยกำกับทุกคำ
5. รูปแบบการทำงานและกรอบความคิด (Mental Model & How it works): อธิบายกลไกเบื้องหลัง สิ่งที่ผู้สัมภาษณ์กำลังวัดผล (Evaluation Rubric) และโครงสร้างความคิด พร้อมแทรกคำอ่านศัพท์เทคนิคภาษาไทยทุกจุด
6. ปัญหาที่พบบ่อย (Common Pitfalls): ข้อผิดพลาดและกับดักที่คนส่วนใหญ่ตอบแล้วตกสัมภาษณ์ (Red Flags)
7. ทางแก้ไขและทางออก (Solutions & Recovery): แนวทางแก้ไข วิธีเอาตัวรอดหากถูกถามต้อน หรือเทคนิคพลิกสถานการณ์
8. คำอ่านศัพท์เทคนิค (Phonetic Pronunciation Guide): ศัพท์เทคนิคหรือคำภาษาอังกฤษทุกคำ ให้คำอ่านภาษาไทย เช่น "คูเบอร์เนติส (Kubernetes)" และแทรกคำอ่านเหล่านี้เข้าไปในข้อความคำตอบทุกส่วนโดยตรงเสมอ
9. บทสรุปผู้บริหาร (Executive Summary): 1 ประโยคสรุปประเด็นสำคัญที่สุดสำหรับคำถามนี้ (Takeaway) ใช้ภาษาที่ทรงพลัง เป็นมืออาชีพ (Executive Presence)`;

    const prompt = `คำถามของผู้สัมภาษณ์: "${question}"

ประวัติคำถามก่อนหน้านี้ในห้องสัมภาษณ์นี้:
${pastQAs.slice(-3).map((item: any, i: number) => `Q${i + 1}: ${item.question}\nA${i + 1}: ${item.directAnswer || item.text}`).join('\n') || 'เป็นคำถามแรก'}

กรุณาวิเคราะห์และส่งออกตามรูปแบบหัวข้อดังนี้อย่างเคร่งครัดและ Full Polish:

# [RISK_LEVEL]
(ระบุเพียงคำเดียว: HIGH หรือ MEDIUM หรือ LOW)

# [RISK_SUMMARY]
(สรุปความเสี่ยงและกับดักสำคัญในคำถามนี้ 1 ประโยคสั้นๆ ชัดเจน)

# [EXECUTIVE_SUMMARY]
(1 ประโยคสรุปประเด็นสำคัญที่สุดสำหรับคำถามนี้ (Takeaway) ใช้ภาษาที่ทรงพลัง เป็นมืออาชีพ (Executive Presence))

# [DIRECT_ANSWER]
(คำตอบที่ถูกต้อง สั้นตรงจุด 1-2 ประโยคทอง ให้ผู้สมัครพูดได้ทันทีใน 10 วินาทีแรก)

# [EXAMPLE_SCRIPT]
(ตัวอย่างคำพูดจริงแบบ Verbatim Script พร้อมตัวอย่างรูปธรรมที่ผู้สมัครพูดตามได้ทันที)

# [HOW_IT_WORKS]
(รูปแบบการทำงาน อธิบายกลไกเบื้องหลัง สิ่งที่ผู้สัมภาษณ์กำลังวัดผล และกรอบความคิด STAR/หลักการสำคัญ สอดรับกับ JD และ Resume)

# [COMMON_PITFALLS]
(ปัญหาที่พบบ่อย กับดัก และข้อผิดพลาดร้ายแรงที่คนมักตกสัมภาษณ์ในคำถามนี้)

# [SOLUTIONS]
(ทางแก้ไข วิธีเอาตัวรอด เทคนิคพลิกสถานการณ์ และทางเลือกในการตอบที่ทรงพลัง)

# [PRONUNCIATION]
(รายการศัพท์เทคนิคและคำภาษาอังกฤษ พร้อมคำอ่านภาษาไทย เช่น:
- อะ-ไจล (Agile) : แนวคิดการทำงานแบบคล่องตัว
- คู-เบอร์-เน-ติส (Kubernetes) : ระบบ Container Orchestration)`;

    const config: any = {
      systemInstruction,
    };

    if (thinkingConfig) {
      config.thinkingConfig = thinkingConfig;
    }
    if (tools) {
      config.tools = tools;
    }

    let stream;
    let chunksEmitted = 0;

    const runStreamWithConfig = async (mName: string, cfg: any) => {
      const s = await ai.models.generateContentStream({
        model: mName,
        contents: prompt,
        config: cfg,
      });
      for await (const chunk of s) {
        const text = chunk.text;
        if (text) {
          chunksEmitted++;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
    };

    try {
      await runStreamWithConfig(selectedModel, config);
    } catch (firstErr: any) {
      console.warn(`[Stream Attempt 1 Warning] (${firstErr.message}). Retrying resiliently...`);
      // If error occurred before emitting chunks, retry with clean config without search tool and fallback model
      if (chunksEmitted === 0) {
        await new Promise((r) => setTimeout(r, 600));
        const retryConfig = { ...config };
        delete retryConfig.tools;
        delete retryConfig.thinkingConfig;

        try {
          await runStreamWithConfig('gemini-3.1-flash-lite', retryConfig);
        } catch (secondErr: any) {
          // Last retry with 1s backoff
          await new Promise((r) => setTimeout(r, 1000));
          await runStreamWithConfig('gemini-3.1-flash-lite', {
            systemInstruction: config.systemInstruction,
          });
        }
      } else {
        throw firstErr;
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error('Error in /api/analyze-question-stream:', error);
    res.write(`data: ${JSON.stringify({ error: error.message || 'Analysis failed' })}\n\n`);
    res.end();
  }
});

/**
 * Targeted Google Search & Company / LinkedIn Intelligence Lookup
 * Uses gemini-3.8-flash with googleSearch tool
 */
app.post('/api/search-company-intel', async (req, res) => {
  try {
    const {
      companyName,
      companyWebsiteUrl = '',
      companyLinkedInUrl = '',
      role = '',
      jd = '',
    } = req.body;

    if (!companyName && !companyWebsiteUrl && !companyLinkedInUrl) {
      return res.status(400).json({ error: 'Company identifier or URL is required' });
    }

    const prompt = `ทำการค้นหาข้อมูลเชิงลึกแบบเจาะจง (Targeted Intelligence) เกี่ยวกับบริษัท "${companyName || companyWebsiteUrl}"
${companyWebsiteUrl ? `เว็บไซต์ทางการ: ${companyWebsiteUrl}` : ''}
${companyLinkedInUrl ? `โปรไฟล์ LinkedIn: ${companyLinkedInUrl}` : ''}
ตำแหน่งที่สัมภาษณ์: ${role || 'ตำแหน่งงานทั่วไป'}
${jd ? `รายละเอียด Job Description ย่อ: ${jd.slice(0, 500)}` : ''}

เป้าหมาย:
1. ธุรกิจหลัก ผลิตภัณฑ์ ข่าวสาร และความสำเร็จล่าสุดใน 3-6 เดือนนี้
2. วัฒนธรรมองค์กร (Company Culture & Core Values) และสไตล์การทำงานที่พนักงานและ LinkedIn พูดถึง
3. Tech Stack / Methodology ที่บริษัทใช้งานจริง (เช่น Cloud, Data/AI, Microservices, Agile)
4. สิ่งที่ผู้สัมภาษณ์และทีมงานของบริษัทนี้ให้ความสำคัญที่สุดในการคัดเลือกคน
5. คำถามทองคำ 3 ข้อที่ผู้สมัครควรถามกลับผู้สัมภาษณ์เพื่อแสดงความรู้จริงเกี่ยวกับบริษัทนี้

ตอบเป็นภาษาไทยอย่างมืออาชีพ กระชับ อ่านเข้าใจง่าย`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    });

    const webSearchSources =
      response.candidates?.[0]?.groundingMetadata?.groundingChunks?.map((chunk: any) => ({
        title: chunk.web?.title,
        uri: chunk.web?.uri,
      })) || [];

    res.json({
      text: response.text || '',
      sources: webSearchSources,
    });
  } catch (error: any) {
    console.error('Error in /api/search-company-intel:', error);
    res.status(500).json({ error: error.message || 'Company intel search failed' });
  }
});

/**
 * Multi-Turn Co-pilot Chat Interface
 * Allows candidate to ask follow-up questions, practice answers, or request variations
 */
app.post('/api/copilot-chat', async (req, res) => {
  try {
    const { messages, context = {}, activeQuestion = '' } = req.body;
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const systemInstruction = `คุณคือ Realtime Interview Co-pilot Assistant ที่ปรึกษาการสัมภาษณ์งานแบบเฉพาะกิจ
ผู้ใช้กำลังอยู่ในห้องสัมภาษณ์งาน หรือกำลังเตรียมซ้อมสัมภาษณ์
ตำแหน่งเป้าหมาย: ${context.role || 'Senior Professional'}
บริษัท: ${context.targetCompany || 'Tech Company'}
คำถามสัมภาษณ์ปัจจุบันที่กำลังพิจารณา: "${activeQuestion || 'ทั่วไป'}"

แนวทางการตอบ:
- ให้คำแนะนำที่กระชับ ตรงประเด็น นำไปพูดได้ทันที
- หากผู้ใช้ถามว่า "ตอบแบบนี้ดีไหม" ให้วิเคราะห์จุดเด่นและจุดที่ควรปรับแก้
- หากมีศัพท์ภาษาอังกฤษ ให้ระบุคำอ่านภาษาไทยควบคู่เสมอ เช่น อะ-ไจล (Agile)
- ใช้ภาษาไทยสุภาพ มั่นใจ ให้กำลังใจ และมีจิตวิทยาการสัมภาษณ์ชั้นยอด`;

    const formattedContents = messages.map((m: any) => ({
      role: m.role === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: formattedContents,
      config: {
        systemInstruction,
      },
    });

    res.json({ reply: response.text?.trim() || '' });
  } catch (error: any) {
    console.error('Error in /api/copilot-chat:', error);
    res.status(500).json({ error: error.message || 'Chat failed' });
  }
});

/**
 * Extract Phonetic Pronunciations on Demand
 */
app.post('/api/extract-pronunciations', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const response = await generateWithFallback({
      model: 'gemini-3.1-flash-lite',
      fallback: 'gemini-3.8-flash',
      contents: `Extract all technical terms and English foreign words from this text and provide their exact phonetic Thai pronunciation in the format "คำอ่านไทย (Original Term)":
"${text}"

Example:
Agile -> อะ-ไจล (Agile)
Kubernetes -> คู-เบอร์-เน-ติส (Kubernetes)
Continuous Integration -> คอน-ทิน-ิว-อัส อิน-ทิ-เกร-ชัน (Continuous Integration)

Return JSON array:
[
  { "term": "Agile", "thai": "อะ-ไจล (Agile)", "note": "แนวคิดการพัฒนาแบบคล่องตัว" }
]`,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              term: { type: Type.STRING },
              thai: { type: Type.STRING },
              note: { type: Type.STRING },
            },
            required: ['term', 'thai'],
          },
        },
      },
    });

    res.json({ pronunciations: JSON.parse(response.text || '[]') });
  } catch (error: any) {
    console.error('Error in /api/extract-pronunciations:', error);
    res.status(500).json({ error: error.message || 'Extraction failed' });
  }
});

/**
 * Audio Transcription using gemini-3.5-transcribe
 * Takes base64 audio and transcribes Thai/English speech
 */
app.post('/api/transcribe', async (req, res) => {
  try {
    const { audioData, mimeType = 'audio/webm' } = req.body;
    if (!audioData) {
      return res.status(400).json({ error: 'Audio data is required' });
    }

    const audioPart = {
      inlineData: {
        mimeType,
        data: audioData,
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-3.5-transcribe',
      contents: {
        parts: [
          audioPart,
          {
            text: 'Transcribe this interview audio recording accurately in Thai and English. Return only the verbatim transcribed speech without added commentary.',
          },
        ],
      },
    });

    res.json({ transcript: response.text?.trim() || '' });
  } catch (error: any) {
    console.error('Error in /api/transcribe:', error);
    res.status(500).json({ error: error.message || 'Transcription failed' });
  }
});

/**
 * Text-to-Speech using gemini-3.8-flash-tts
 * Generates natural audio for discreet earpiece listening
 */
app.post('/api/tts', async (req, res) => {
  try {
    const { text, voiceName = 'Kore' } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Text is required' });
    }

    const cleanText = text.slice(0, 400);

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: cleanText,
              speechMetadata: {
                style: 'Confident, clear professional Thai and English interview candidate',
              },
            },
          ],
        },
      ],
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) {
      return res.status(500).json({ error: 'Failed to generate audio stream' });
    }

    res.json({ audio: base64Audio, mimeType: 'audio/wav' });
  } catch (error: any) {
    console.error('Error in /api/tts:', error);
    res.status(500).json({ error: error.message || 'TTS generation failed' });
  }
});

/**
 * Analyze Uploaded Documents or Images (Resume, JD, Screenshot)
 * Uses gemini-4-argon for deep document and image comprehension
 */
app.post('/api/analyze-doc', async (req, res) => {
  try {
    const { fileData, mimeType = 'image/png', fileType = 'resume' } = req.body;
    if (!fileData) {
      return res.status(400).json({ error: 'File data is required' });
    }

    const imagePart = {
      inlineData: {
        mimeType,
        data: fileData,
      },
    };

    const prompt = fileType === 'jd'
      ? `วิเคราะห์เอกสาร Job Description (JD) นี้อย่างละเอียด:
1. ตำแหน่งงานและระดับความอาวุโส (Seniority)
2. ทักษะหลักที่ต้องมี (Must-have Skills)
3. ทักษะที่ได้เปรียบ (Nice-to-have Skills)
4. คำถามสัมภาษณ์ที่น่าจะถูกถามอย่างแน่นอน 5 ข้อ พร้อมจุดเน้นที่ผู้สัมภาษณ์มองหา
5. กับดักหรือจุดท้าทายของตำแหน่งนี้

ตอบเป็นภาษาไทยในรูปแบบ JSON โครงสร้างอ่านง่าย`
      : `วิเคราะห์เอกสาร Resume / ประวัติการทำงานนี้:
1. สรุปโปรไฟล์และจุดเด่นหลัก (Core Strengths)
2. โครงการเด่นที่ควรหยิบยกมาเล่าแบบ STAR Method
3. ช่องโหว่หรือจุดอ่อนที่ผู้สัมภาษณ์อาจเจาะถาม (เช่น gap year, tech stack ที่ยังขาด) พร้อมข้อแนะนำวิธีตอบรับมือ
4. ทักษะเด่นที่ควรชูเพื่อเพิ่มคะแนน

ตอบเป็นภาษาไทยในรูปแบบ JSON โครงสร้างอ่านง่าย`;

    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: {
        parts: [imagePart, { text: prompt }],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    res.json({ analysis: JSON.parse(response.text || '{}') });
  } catch (error: any) {
    console.error('Error in /api/analyze-doc:', error);
    res.status(500).json({ error: error.message || 'Document analysis failed' });
  }
});

// Mount Vite or static dist
async function setupVite() {
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[InterviewPulse Server] Running on http://localhost:${PORT}`);
  });
}

setupVite();
