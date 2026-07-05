(function () {
  let lastSubmissionId = null;

  const originalFetch =
    window.fetch;

  window.fetch = async (
    ...args
  ) => {
    const response =
      await originalFetch(
        ...args
      );

    try {
      const url =
        typeof args[0] ===
        "string"
          ? args[0]
          : args[0]?.url || "";

      if (
        url.includes("check")
      ) {
        const clone =
          response.clone();

        const data =
          await clone.json();

        if (
          data.state ===
            "SUCCESS" &&
          data.status_msg ===
            "Accepted" &&
          data.submission_id !==
            lastSubmissionId
        ) {
          lastSubmissionId =
            data.submission_id;

          window.postMessage(
            {
              source:
                "leetcode-sync",
              type:
                "accepted",
              submissionId:
                data.submission_id
            },
            "*"
          );
        }
      }
    } catch (e) {}

    return response;
  };
})();