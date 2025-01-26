import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

function cleanJsonString(str: string) {
 try {
   str = str.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
   const jsonMatch = str.match(/\{[\s\S]*\}/);
   if (jsonMatch) str = jsonMatch[0];
   
   if (str.includes('```json')) {
     str = str.split('```json')[1].split('```')[0].trim();
   } else if (str.includes('```')) {
     str = str.split('```')[1].split('```')[0].trim();
   }
   
   const parsed = JSON.parse(str);
   return JSON.stringify(parsed);
 } catch (e) {
   console.error('Error cleaning JSON string:', e);
   console.error('Original string:', str);
   throw new Error('Failed to clean and parse JSON response');
 }
}

export async function POST(request: NextRequest) {
 try {
   const body = await request.json();
   const apiKey = process.env.ANTHROPIC_API_KEY;

   if (!apiKey) {
     return NextResponse.json(
       { error: 'API key is not configured' },
       { status: 500 }
     );
   }
   
   const response = await fetch('https://api.anthropic.com/v1/messages', {
     method: 'POST',
     headers: {
       'Content-Type': 'application/json',
       'anthropic-version': '2023-06-01',
       'x-api-key': apiKey,
     },
     body: JSON.stringify({
       ...body,
       stream: false
     }),
   });

   if (!response.ok) {
     const errorData = await response.json();
     return NextResponse.json(
       { error: errorData.error?.message || 'API request failed' },
       { status: response.status }
     );
   }

   const data = await response.json();

   if (!data.content?.[0]?.text) {
     return NextResponse.json(
       { error: 'Invalid response from API' },
       { status: 500 }
     );
   }

   try {
     const cleanedJson = cleanJsonString(data.content[0].text);
     const parsedCharacter = JSON.parse(cleanedJson);
     
     if (parsedCharacter.type === 'eliza') {
       if (!parsedCharacter.bio?.length || parsedCharacter.bio.length < 280) {
         throw new Error('Bio is too short or missing (minimum 280 characters)');
       }
       if (!parsedCharacter.lore?.length || parsedCharacter.lore.length < 280) {
         throw new Error('Lore is too short or missing (minimum 280 characters)');
       }
     } else if (parsedCharacter.type === 'zerepy') {
       if (!parsedCharacter.bio?.length || parsedCharacter.bio.length < 3) {
         throw new Error('Bio must contain at least 3 descriptions');
       }
     }

     return NextResponse.json({
       content: [{ text: cleanedJson }]
     });
     
   } catch (e) {
     console.error('Character parsing/validation error:', e);
     throw new Error(e instanceof Error ? e.message : 'Failed to process character data');
   }

 } catch (error: any) {
   console.error('General API error:', error);
   return NextResponse.json(
     { error: error.message || 'Internal server error' },
     { status: 500 }
   );
 }
}