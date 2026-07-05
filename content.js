console.log("LeetCode Sync Loaded");

function getSlug() {
    return window.location.pathname.split("/")[2];
}

console.log("LeetCode Sync Loaded for:", getSlug());

// Inject page script
const script = document.createElement("script");
script.src = chrome.runtime.getURL("inject.js");
document.documentElement.appendChild(script);
script.remove();

function getSettings() {
    return new Promise((resolve) => {
        chrome.storage.local.get(['githubToken', 'githubUsername', 'githubRepo', 'groqApiKey'], resolve);
    });
}

async function getQuestion(slug) {
    const res = await fetch("https://leetcode.com/graphql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            query: `
                query questionData($titleSlug: String!) {
                    question(titleSlug: $titleSlug) {
                        questionFrontendId
                        title
                        difficulty
                        content
                        exampleTestcases
                        topicTags { name }
                        companyTagStats
                        hints
                    }
                }
            `,
            variables: { titleSlug: slug }
        })
    });
    return res.json();
}

function getCode() {
    const codeElement = document.querySelector(".view-lines");
    return codeElement ? codeElement.innerText : null;
}

async function waitForCode(timeout = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const code = getCode();
        if (code) return code;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    return null;
}

function generateReadme(question, currentSlug) {
    const tags = question.topicTags ? question.topicTags.map(tag => `- ${tag.name}`).join("\n") : "N/A";
    let companyTags = "Not Available";
    try {
        const parsed = JSON.parse(question.companyTagStats || "{}");
        companyTags = parsed ? JSON.stringify(parsed, null, 2) : "Not Available";
    } catch (e) { }

    return `# ${question.questionFrontendId}. ${question.title}

## Difficulty
${question.difficulty}

## Tags
${tags}

## URL
https://leetcode.com/problems/${currentSlug}/

## Problem Statement

${question.content}

## Example Test Cases

\`\`\`
${question.exampleTestcases || "N/A"}
\`\`\`

## Hints

${question.hints ? question.hints.join("\n") : "N/A"}

## Company Tags

\`\`\`json
${companyTags}
\`\`\`
`;
}

async function fetchGithub(path, token, owner, repo) {
    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        headers: { 
            Authorization: `Bearer ${token}`, 
            Accept: "application/vnd.github+json" 
        }
    });
    if (response.status === 404) return null;
    return response.json();
}

async function uploadFile(path, content, message, token, owner, repo) {
    const existing = await fetchGithub(path, token, owner, repo);
    const body = {
        message,
        content: btoa(unescape(encodeURIComponent(content)))
    };
    if (existing && !Array.isArray(existing) && existing.sha) {
        body.sha = existing.sha;
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });
    return response.json();
}

async function callGroq(prompt, apiKey, systemPrompt = "") {
    const messages = [];
    if (systemPrompt) {
        messages.push({ role: "system", content: systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile", // Smarter model for logic reasoning
            messages: messages,
            temperature: 0.1 // Low temperature for consistency
        })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error.message);
    return data.choices[0].message.content;
}

async function uploadToGithub() {
    try {
        const currentSlug = getSlug();
        console.log("Starting upload process for:", currentSlug);
        const settings = await getSettings();
        if (!settings.githubToken || !settings.githubUsername || !settings.githubRepo || !settings.groqApiKey) {
            console.error("Missing API Keys or Settings. Please check the extension popup.");
            return;
        }

        const data = await getQuestion(currentSlug);
        const question = data.data.question;
        const code = await waitForCode();

        if (!code) {
            console.error("Code not found on page.");
            return;
        }

        const questionNumber = question.questionFrontendId.padStart(4, '0');
        const folder = `${questionNumber} - ${question.title}`;

        // 1. Check existing folders and files
        const folderContents = await fetchGithub(folder, settings.githubToken, settings.githubUsername, settings.githubRepo);
        
        let methodCount = 0;
        let existingMethodsCode = [];

        if (folderContents && Array.isArray(folderContents)) {
            // Find existing methods
            for (const item of folderContents) {
                if (item.type === 'dir' && item.name.startsWith('Method ')) {
                    methodCount++;
                    // Fetch the code to compare
                    const codeFile = await fetchGithub(`${item.path}/solution.java`, settings.githubToken, settings.githubUsername, settings.githubRepo);
                    if (codeFile && codeFile.content) {
                        try {
                            const decodedCode = decodeURIComponent(escape(atob(codeFile.content)));
                            existingMethodsCode.push(decodedCode);
                        } catch (e) {
                            console.error("Error decoding old code", e);
                        }
                    }
                }
            }
        } else {
            // Upload main README.md if folder doesn't exist
            console.log("Uploading Root Problem README...");
            const readme = generateReadme(question, currentSlug);
            await uploadFile(`${folder}/README.md`, readme, `Add README for ${question.title}`, settings.githubToken, settings.githubUsername, settings.githubRepo);
        }

        // 2. Smart LLM Duplicate Check
        if (existingMethodsCode.length > 0) {
            console.log("Checking for duplicate approaches via AI...");
            for (const oldCode of existingMethodsCode) {
                const systemPrompt = "You are an expert code logic analyzer. Compare Code A and Code B. If they use the exact same algorithm, time complexity, and underlying logic (even if variable names, function names, loops, or whitespaces are slightly modified), reply with exactly 'YES'. If the core algorithm or approach is fundamentally different (e.g., recursive vs iterative, or different data structure), reply with exactly 'NO'. Do not provide any explanation, just output YES or NO.";
                const prompt = `Code A:\n${oldCode}\n\nCode B:\n${code}`;
                
                const response = await callGroq(prompt, settings.groqApiKey, systemPrompt);
                if (response.trim().toUpperCase().includes("YES")) {
                    console.log("Duplicate AI Approach detected. Upload skipped.");
                   
                    return;
                }
            }
        }

        // 3. Create new Method folder and upload
        const nextMethod = methodCount + 1;
        const methodFolder = `${folder}/Method ${nextMethod}`;
        console.log(`Uploading as ${methodFolder}...`);

        // Generate AI explanation
        console.log("Generating AI explanation...");
        const explainPrompt = `Explain the approach, time complexity, and space complexity of the following code for a LeetCode problem. Use Markdown format.\n\nCode:\n${code}`;
        const aiExplanation = await callGroq(explainPrompt, settings.groqApiKey);

        // Upload Solution Code
        await uploadFile(`${methodFolder}/solution.java`, code, `Add Solution for ${question.title} (Method ${nextMethod})`, settings.githubToken, settings.githubUsername, settings.githubRepo);
        
        // Upload AI README
        await uploadFile(`${methodFolder}/README.md`, aiExplanation, `Add Explanation for Method ${nextMethod}`, settings.githubToken, settings.githubUsername, settings.githubRepo);

        console.log(`Successfully uploaded Method ${nextMethod}!`);
         

    } catch (error) {
        console.error("Upload Error:", error);
    }
}

window.addEventListener("message", async event => {
    if (event.source !== window) return;

    if (event.data?.source === "leetcode-sync" && event.data?.type === "accepted") {
        console.log("Accepted Submission:", event.data.submissionId);
        await uploadToGithub();
    }
});