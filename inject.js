(function () {
  let lastSubmissionId = null;
  let lastSubmitId = null; // Track ID from real submit, not from run

  const originalFetch = window.fetch;

  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
      const clone = response.clone();

      if (url.includes("/submit/")) {
        // Intercept the initial submit request to get the true submission ID
        const data = await clone.json();
        if (data && data.submission_id) {
          lastSubmitId = data.submission_id;
        }
      } else if (url.includes("check")) {
        const data = await clone.json();

        if (
          data.state === "SUCCESS" &&
          data.status_msg === "Accepted" &&
          data.submission_id === lastSubmitId &&
          data.submission_id !== lastSubmissionId
        ) {
          lastSubmissionId = data.submission_id;

          window.postMessage(
            {
              source: "leetcode-sync",
              type: "accepted",
              submissionId: data.submission_id,
              lang: data.lang
            },
            "*"
          );
        }
      }
    } catch (e) {}

    return response;
  };
})();