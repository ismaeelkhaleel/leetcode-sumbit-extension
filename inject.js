(function () {
  let lastSubmissionId = null;
  let lastSubmitId = null; // Track ID from real submit, not from run
  let lastSubmittedCode = null; // Track the actual code submitted

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    // Attempt to extract the code from the request body if this is a submit
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    const isSubmit = url.includes("/submit") && !url.includes("/submissions");

    if (isSubmit) {
      try {
        const options = args[1];
        if (options && options.body) {
          const reqBody = JSON.parse(options.body);
          if (reqBody.typed_code) {
            lastSubmittedCode = reqBody.typed_code;
          }
        }
      } catch (e) {}
    }

    const response = await originalFetch(...args);

    try {
      const clone = response.clone();

      if (isSubmit) {
        // Intercept the initial submit request to get the true submission ID
        const data = await clone.json();
        if (data && data.submission_id) {
          lastSubmitId = data.submission_id;
        }
      } else if (url.includes("check")) {
        const data = await clone.json();

        const urlMatch = url.match(/submissions\/detail\/([a-zA-Z0-9_]+)\/check/);
        const checkSubmissionId = urlMatch ? urlMatch[1] : (data.submission_id || null);

        const isTrueSubmit = (lastSubmitId !== null && String(checkSubmissionId) === String(lastSubmitId)) ||
                             (lastSubmitId === null && /^\d+$/.test(String(checkSubmissionId)));

        if (
          data.state === "SUCCESS" &&
          data.status_msg === "Accepted" &&
          checkSubmissionId != null &&
          isTrueSubmit &&
          checkSubmissionId !== lastSubmissionId
        ) {
          lastSubmissionId = checkSubmissionId;

          window.postMessage(
            {
              source: "leetcode-sync",
              type: "accepted",
              submissionId: checkSubmissionId,
              lang: data.lang,
              code: lastSubmittedCode
            },
            "*"
          );
        }
      }
    } catch (e) {}

    return response;
  };
})();