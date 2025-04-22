import { Langbase, getRunner } from 'langbase';

const getLangbase = () => {
    const apiKey = process.env.NEXT_PUBLIC_LANGBASE_API_KEY;
    if (!apiKey) {
        throw new Error("Missing Langbase API Key. Check your .env.local file.");
    }
    return new Langbase({ apiKey });
};

const langbase = getLangbase();
const MAX_PROCESSING_TIME = 45000; // 45 seconds (to allow buffer for Vercel's 60s limit)

// Upload text to Langbase memory with timeout handling
export const uploadToMemory = async (content: string, filename: string) => {
    try {
        const buffer = Buffer.from(content, "utf-8");

        // Add timeout handling for the upload operation
        const uploadPromise = langbase.memory.documents.upload({
            document: buffer,
            memoryName: "living-abroad",
            contentType: "text/plain",
            documentName: filename,
        });

        const response = await Promise.race([
            uploadPromise,
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error("Upload operation timed out")), MAX_PROCESSING_TIME)
            )
        ]);

        return response;
    } catch (error) {
        console.error("Error uploading to memory:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Upload failed: ${errorMessage}`);
    }
};

// Send a message to Langbase chat with better timeout handling
export const chatWithLangbase = async (message: string, threadId?: string) => {
    try {

        
        const startTime = Date.now();
        const response = await langbase.pipe.run({
            name: "living-abroad",
            stream: true,
            messages: [{ role: "user", content: message }], // Only send the current message
            ...(threadId && { threadId }) // Include threadId if available
        });

        // Capture thread ID from response
        const newThreadId = response.threadId || threadId;
        
        const { stream } = response;
        const runner = getRunner(stream);

        let result = "";
        let isCompleted = false;
        
        // Process stream with timeout awareness
        await new Promise<void>((resolve) => {
            // Track if we're approaching the timeout
            const checkTimeRemaining = () => {
                const elapsed = Date.now() - startTime;
                return elapsed < MAX_PROCESSING_TIME;
            };
            
            // Handle content streaming
            runner.on("content", (content) => {
                // Only append content if we still have time
                if (checkTimeRemaining()) {
                    result += content;
                }
            });
            
            // Normal completion
            runner.on("end", () => {
                isCompleted = true;
                resolve();
            });
            
            // Force resolve after timeout
            setTimeout(() => {
                if (!isCompleted) {
                    resolve();
                }
            }, MAX_PROCESSING_TIME);
        });

        // Add a note if the response was truncated due to timeout
        if (Date.now() - startTime >= MAX_PROCESSING_TIME) {
            result += "\n\n[Note: Response was truncated due to time constraints]";
        }
        
        // Return both the result and the threadId
        return {
            result,
            threadId: newThreadId
        };
    } catch (error) {
        console.error("Langbase Chat Error:", error);
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Chat failed: ${errorMessage}`);
    }
};