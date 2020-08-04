#!/usr/bin/env node
require("./command-runner").run(async () => {
    // -----------------------------------------------------------------------------------------
    // #region Imports
    // -----------------------------------------------------------------------------------------

    const azure         = require("./_modules/azure");
    const dotnetPath    = require("./_modules/dotnet-path");
    const echo          = require("./_modules/echo");
    const program       = require("commander");
    const shell         = require("shelljs");

    // #endregion Imports

    // -----------------------------------------------------------------------------------------
    // #region Variables
    // -----------------------------------------------------------------------------------------

    let   appName             = null;
    let   branch              = null;
    let   clientId            = null;
    let   force               = false;
    const pythonInstallerUrl  = "https://www.python.org/ftp/python/3.7.4/python-3.7.4-amd64.exe";
    let   remote              = null;
    let   resourceGroup       = null;
    let   secret              = null;
    let   tenantId            = null;
    let   username            = null;

    // #endregion Variables

    /// -----------------------------------------------------------------------------------------
    // #region Functions
    // -----------------------------------------------------------------------------------------

    // Developer note: This could/should likely be extracted into its own module so that it can be
    // unit tested and export constants for option flags.
    const deployAzureWebApp = {
        createRemoteIfMissing() {
            if (shell.exec(`git remote get-url ${remote}`).code !== 0) {
                const url = shell.exec(`az webapp deployment list-publishing-credentials --name ${appName} --resource-group ${resourceGroup} --query scmUri --output tsv`);

                if (shell.exec(`git remote add ${remote} ${url}`).code !== 0)
                {
                    echo.error("Error trying to add remote!");
                    azure.logout();
                    shell.exit(1);
                }
            }
        },
        pushToRemote() {
            let pushCmd = `git push ${remote} ${branch}:master`;

            if (force) {
                pushCmd += " -f";
            }

            if (shell.exec(pushCmd).code !== 0) {
                echo.error(" - Failed pushing to Web App remote");
                azure.logout();
                shell.exit(1);
            }
        },
        description() {
            return `Runs dotnet publish on ${dotnetPath.solutionPath()} solution and deploys to configured AWS Elastic Beanstalk environment`;
        },
        async run() {
            // Check system/command requirements
            this.validateOrExit();

            // Login to Azure
            if (username != null) {
                azure.login(username, secret);
            } else {
                azure.login(clientId, tenantId, secret);
            }

            this.createRemoteIfMissing();

            this.pushToRemote();

            // Logout from Azure
            azure.logout();

            echo.newLine();
            echo.success("Application successfully deployed to Azure Web App!");
        },
        validateOrExit() {
            const errors = [];

            // Validate arguments
            clientId = program.clientId;
            tenantId = program.tenantId;
            username = program.username;

            const missingServicePrincipalArgs = (clientId == null || tenantId == null);

            if (username == null && missingServicePrincipalArgs) {
                errors.push("when --client-id or --tenant-id not provided, --username is required");
            }

            secret = program.secret;
            if (secret == null) {
                errors.push("--secret is required");
            }

            appName = program.appName;
            if (appName == null) {
                errors.push("--app-name is required");
            }

            resourceGroup = program.resourceGroup;
            if (resourceGroup == null) {
                errors.push("--resource-group is required");
            }

            branch = program.branch;
            if (branch == null) {
                errors.push("--branch is required");
            }

            remote = program.remote;
            if (remote == null) {
                errors.push("--remote is required");
            }

            if (program.force != null) {
                force = true;
            }

            // Bail if up-front arguments are errored
            if (errors.length > 0) {
                echo.errors(errors);
                shell.exit(1);
            }

            if (!shell.which("az")) {
                echo.message("Azure CLI not found. Attempting install via PIP...");

                if (!shell.which("pip")) {
                    echo.error(`PIP is required - ${pythonInstallerUrl}`);
                    shell.exit(1);
                }

                if (shell.exec("pip install azure-cli").code !== 0) {
                    echo.error("Failed to install azure cli via pip");
                    shell.exit(1);
                }

                echo.success(" - Successfully installed Azure CLI");
            }

            // Handle errors
            if (errors.length > 0) {
                echo.errors(errors);
                shell.exit(1);
            }

            return true;
        },
    };

    // #endregion Functions

    // -----------------------------------------------------------------------------------------
    // #region Entrypoint
    // -----------------------------------------------------------------------------------------

    program
        .usage("option")
        .description(deployAzureWebApp.description())
        .option("--app-name <applicationName>",     "Required name of the Azure Web App")
        .option("--branch <branch>",                "Required name of the branch to deploy")
        .option("--client-id <clientID>",           "Required Client ID (if deploying using Service Principal)")
        .option("--force",                          "Optional flag indicating you want to force push to the git remote")
        .option("--remote <remote>",                "Required name of the git remote used for Azure Web App deploys (will be created if it does not exist)")
        .option("--resource-group <resourceGroup>", "Required name of the resource group to which the Azure Web App belongs")
        .option("--secret <profile>",               "Required secret for login -- either client secret for service principal or account password")
        .option("--tenant-id <tenantID>",           "Required Tenant ID (if deploying using Service Principal)")
        .option("--username <username>",            "Required Azure username (if deploying using Azure credentials)")
        .parse(process.argv);

    await deployAzureWebApp.run();

    // #endregion Entrypoint
});
