import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

interface GenerateRequest {
  count: number;
  provider: 'anthropic' | 'openai';
  tone: 'flirty' | 'casual' | 'playful' | 'mysterious';
  length: 'short' | 'medium';
  emojiLevel: 'none' | 'some' | 'lots';
  includeHashtags: boolean;
  includeCallToAction: boolean;
  customInstructions?: string;
  /** Content type: 'description' for post captions, 'bio' for profile bios */
  contentType?: 'description' | 'bio';
}

const EXAMPLE_DESCRIPTIONS = [
  "Message meeee🙈been bored all day today 😅 #spicylink #click",
  "Check me out in my bio🙈 love to chat!!",
  "Morning :) check my bio for more 🙈",
  "Goodnight 😅🙈",
  "Have a good day? Message me😩🙈",
  "New to socials!! Plz blow me up 🙈😅 #of #spicy",
  "You know where to find more…🙈",
];

const EXAMPLE_BIOS = [
  "just a girl who loves attention 🙈 link below 💕",
  "ur fav e-girl 💋 tap the link bb",
  "bored & looking for fun 😏 check my link",
  "sweet but a lil spicy 🌶️ link in bio",
  "here for a good time 💕 click below",
  "let's be friends 🙈💗 link ⬇️",
  "new here!! show me some love 💕",
];

function buildPrompt(params: GenerateRequest): string {
  const {
    count,
    tone = 'flirty',
    length = 'short',
    emojiLevel = 'lots',
    includeHashtags = true,
    includeCallToAction = true,
    customInstructions,
    contentType = 'description',
  } = params;

  const toneDescriptions: Record<string, string> = {
    flirty: 'flirty, teasing, and suggestive but not explicit',
    casual: 'casual, friendly, and approachable',
    playful: 'playful, fun, and energetic',
    mysterious: 'mysterious, intriguing, and alluring',
  };

  const lengthDescriptions: Record<string, string> = {
    short: '5-15 words',
    medium: '15-30 words',
  };

  const emojiDescriptions: Record<string, string> = {
    none: 'Do not use any emojis',
    some: 'Use 1-2 emojis sparingly',
    lots: 'Use 2-4 emojis throughout, especially 🙈 😅 😩 💕 💋 and similar cute/playful emojis',
  };

  // Bio-specific prompt
  if (contentType === 'bio') {
    return `Generate ${count} unique Instagram profile bios for content creators.

STYLE REQUIREMENTS:
- Tone: ${toneDescriptions[tone]}
- Length: Very short, 3-10 words max (Instagram bio space is limited)
- Emojis: ${emojiDescriptions[emojiLevel]}
- Include a subtle reference to having a link (like "link below", "tap link", "click ⬇️")
${customInstructions ? `- Additional instructions: ${customInstructions}` : ''}

REFERENCE EXAMPLES (match this vibe):
${EXAMPLE_BIOS.map(d => `"${d}"`).join('\n')}

IMPORTANT:
- Each bio should be UNIQUE and different from others
- Keep it casual with lowercase letters
- Sound natural and authentic
- Very concise - these go in the Instagram bio field
- DO NOT include hashtags
- Vary the style - some cute, some mysterious, some direct

Output ONLY a JSON array of strings, nothing else. Example format:
["bio 1", "bio 2", "bio 3"]`;
  }

  // Default: post description prompt
  return `Generate ${count} unique Instagram post captions/descriptions for a content creator.

STYLE REQUIREMENTS:
- Tone: ${toneDescriptions[tone]}
- Length: ${lengthDescriptions[length]}
- Emojis: ${emojiDescriptions[emojiLevel]}
${includeHashtags ? '- Include 1-3 relevant hashtags like #spicy #of #linkinbio #click' : '- Do not include hashtags'}
${includeCallToAction ? '- Include a soft call-to-action directing to bio/messages' : ''}
${customInstructions ? `- Additional instructions: ${customInstructions}` : ''}

REFERENCE EXAMPLES (match this vibe):
${EXAMPLE_DESCRIPTIONS.map(d => `"${d}"`).join('\n')}

IMPORTANT:
- Each caption should be UNIQUE and different from others
- Keep it casual with intentional lowercase and informal spelling (like "plz", "meeee")
- Sound natural and authentic, not overly polished
- Vary the structure - some questions, some statements, some greetings

Output ONLY a JSON array of strings, nothing else. Example format:
["caption 1", "caption 2", "caption 3"]`;
}

async function generateWithAnthropic(prompt: string): Promise<string[]> {
  const anthropic = new Anthropic();

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = message.content.find(block => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Anthropic');
  }

  return parseJsonArray(textContent.text);
}

async function generateWithOpenAI(prompt: string): Promise<string[]> {
  const openai = new OpenAI();

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 1024,
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return parseJsonArray(content);
}

function parseJsonArray(text: string): string[] {
  const responseText = text.trim();
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Could not parse AI response as JSON array');
  }

  const descriptions: string[] = JSON.parse(jsonMatch[0]);
  if (!Array.isArray(descriptions)) {
    throw new Error('AI response is not an array');
  }

  return descriptions;
}

export async function POST(request: NextRequest) {
  try {
    const body: GenerateRequest = await request.json();
    const { count, provider = 'openai' } = body;

    if (!count || count < 1 || count > 50) {
      return NextResponse.json(
        { error: 'Count must be between 1 and 50' },
        { status: 400 }
      );
    }

    const prompt = buildPrompt(body);
    let descriptions: string[];

    if (provider === 'anthropic') {
      if (!process.env.ANTHROPIC_API_KEY) {
        return NextResponse.json(
          { error: 'Anthropic API key not configured. Add ANTHROPIC_API_KEY to .env.local' },
          { status: 500 }
        );
      }
      descriptions = await generateWithAnthropic(prompt);
    } else {
      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { error: 'OpenAI API key not configured. Add OPENAI_API_KEY to .env.local' },
          { status: 500 }
        );
      }
      descriptions = await generateWithOpenAI(prompt);
    }

    return NextResponse.json({
      success: true,
      descriptions,
    });
  } catch (error) {
    console.error('AI generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate descriptions' },
      { status: 500 }
    );
  }
}
