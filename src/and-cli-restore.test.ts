import { shouldDisplayHelpMenu } from "./tests/shared-specs";

// -----------------------------------------------------------------------------------------
// #region Tests
// -----------------------------------------------------------------------------------------

describe("and-cli-restore", () => {
    // -----------------------------------------------------------------------------------------
    // #region help
    // -----------------------------------------------------------------------------------------

    shouldDisplayHelpMenu("restore");

    // #endregion help
});

// #endregion Tests
