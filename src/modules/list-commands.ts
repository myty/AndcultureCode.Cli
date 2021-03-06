import { CollectionUtils, StringUtils } from "andculturecode-javascript-core";
import { Options } from "../constants/options";
import { Constants } from "./constants";
import { Echo } from "./echo";
import { Formatters } from "./formatters";
import upath from "upath";
import os from "os";
import shell from "shelljs";
import fs from "fs";
import { File } from "./file";
import { ListCommandsOptions } from "../interfaces/list-commands-options";
import { CommandDefinitions } from "./command-definitions";
import { PackageConfig } from "./package-config";
import { CommandRegistry } from "./command-registry";

// -----------------------------------------------------------------------------------------
// #region Interfaces
// -----------------------------------------------------------------------------------------

/**
 * DTO for parsing & storing command/option info from commander's output
 */
interface ParsedCommandDto {
    command: string;
    options: string[];
    parent: string | null;
}

// #endregion Interfaces

// -----------------------------------------------------------------------------------------
// #region Constants
// -----------------------------------------------------------------------------------------

const { CLI_NAME, CLI_CONFIG_DIR } = Constants;
const { shortFlag: helpFlag } = Options.Help;
const BIN_NAME = PackageConfig.getLocalBinName() ?? CLI_NAME;
const CACHE_FILENAME = `commands.${BIN_NAME}.json`;
const CACHE_PATH = upath.join(os.homedir(), CLI_CONFIG_DIR, CACHE_FILENAME);
const COMMANDS_START_STRING = "Commands:";
const COMMANDS_END_STRING = "help [command]";
const DEFAULT_INDENT = 4;
const DEFAULT_OPTIONS: Required<ListCommandsOptions> = {
    includeHelp: false,
    indent: DEFAULT_INDENT,
    useColor: true,
    prefix: "- [ ] ",
    skipCache: false,
};
const FILTERED_STRINGS = ["\t", CommandRegistry.ALIAS_PREFIX];
const OPTIONS_START_STRING = "Options:";
const OPTIONS_END_STRING = Options.Help.toString();

// #endregion Constants

// -----------------------------------------------------------------------------------------
// #region Variables
// -----------------------------------------------------------------------------------------

let _dtos: ParsedCommandDto[] = [];
let _options: Required<ListCommandsOptions> = { ...DEFAULT_OPTIONS };

// #endregion Variables

// -----------------------------------------------------------------------------------------
// #region Public Functions
// -----------------------------------------------------------------------------------------

const ListCommands = {
    DEFAULT_OPTIONS,
    cmd(command?: string): string {
        if (StringUtils.isEmpty(command)) {
            return `${BIN_NAME} ${helpFlag}`;
        }

        return `${BIN_NAME} ${command} ${helpFlag}`;
    },
    description(): string {
        return CommandDefinitions.list.description;
    },
    parse(): void {
        _parseChildrenAndOptions();
    },
    parseOrReadCache(): void {
        if (_options.skipCache) {
            Echo.message("Skipping cache if it exists...");
            this.parse();
            return;
        }

        this.readCachedFile();
        if (CollectionUtils.hasValues(_dtos)) {
            return;
        }

        this.resetCache();
        this.parse();
    },
    print(dtos: ParsedCommandDto[], indent: number = 0): void {
        // Ensure we start printing from the parent commands first so they appear in order
        const commandsSortedByParents = _getParentCommandsOrDefault(dtos);

        commandsSortedByParents.forEach((command) =>
            this.printCommand(command, indent)
        );
    },
    printCommand(dto: ParsedCommandDto, indent: number): void {
        const commandMessage = _options.useColor
            ? Formatters.green(dto.command)
            : dto.command;
        _echoFormatted(commandMessage, indent);

        this.printOptions(dto, indent + _options.indent);

        const children = _getChildren(dto);
        this.print(children, indent + _options.indent * 2);
    },
    printOption(option: string, indent: number): void {
        const optionMessage = _options.useColor
            ? Formatters.yellow(option)
            : option;
        _echoFormatted(optionMessage, indent);
    },
    printOptions(dto: ParsedCommandDto, indent: number): void {
        dto.options.forEach((option: string) =>
            this.printOption(option, indent)
        );
    },
    readCachedFile(): void {
        if (!File.exists(CACHE_PATH)) {
            this.resetCache();
            Echo.message("No cached file found, building from scratch.");
            return;
        }

        Echo.message("Found command list cache, attempting to read...");
        try {
            const file = fs.readFileSync(CACHE_PATH);
            _dtos = JSON.parse(file.toString());
        } catch (error) {
            this.resetCache();
            Echo.error(
                `There was an error attempting to read or deserialize the file at ${CACHE_PATH} - ${error}`
            );
        }
    },
    resetCache(): void {
        this.setOptions({ skipCache: true });
        _dtos = [];
    },
    run(options: ListCommandsOptions): void {
        this.setOptions(options);

        this.parseOrReadCache();
        this.print(_dtos);

        this.saveCachedFile();
    },
    saveCachedFile(): void {
        Echo.message(`Writing command list to cached file at ${CACHE_PATH}...`);
        try {
            shell.mkdir("-p", upath.dirname(CACHE_PATH));
            shell.touch(CACHE_PATH);
            fs.writeFileSync(CACHE_PATH, JSON.stringify(_dtos, undefined, 4));
        } catch (error) {
            Echo.error(
                `There was an error writing to ${CACHE_PATH} - ${error}`
            );
            shell.exit(1);
        }

        Echo.success("Cached file successfully updated.");
    },
    setOptions(updated: Partial<ListCommandsOptions>): void {
        _options = { ...DEFAULT_OPTIONS, ..._options, ...updated };
    },
};

// #endregion Public Functions

// -----------------------------------------------------------------------------------------
// #region Private Functions
// -----------------------------------------------------------------------------------------

const _addOrUpdateDto = (updatedDto: ParsedCommandDto): void => {
    const findByCommand = (existingDto: ParsedCommandDto) =>
        existingDto.command === updatedDto.command;
    const existing = _dtos.find(findByCommand) ?? {};
    _dtos = _dtos.filter(
        (existing: ParsedCommandDto) => !findByCommand(existing)
    );
    _dtos.push({
        ...existing,
        ...updatedDto,
    });
};

/**
 * Constructs a dto with the proper parent/child relationship, taking into account nesting
 */
const _buildDto = (
    fullCommand: string,
    options: string[]
): ParsedCommandDto => {
    const commands = fullCommand.split(" ");
    const hasNestedCommands = commands.length > 1;
    // Remove the last space-separated string if present as it should be the deepest child
    const command = hasNestedCommands ? commands.pop()! : fullCommand;
    // If there are nested commands, pop off the closest parent from the end of the string (supports nesting of any depth)
    const parent = hasNestedCommands ? commands.pop()! : null;

    return {
        command,
        options,
        parent,
    };
};

/**
 * Splits and filters output by new lines that match the starting & ending pattern to retrieve options
 * or commands
 */
const _parseOutputByRange = (
    output: string,
    startPattern: string,
    endPattern: string
): string[] => {
    let lines = output.split("\n");
    const startIndex = lines.findIndex((line) => line.includes(startPattern));
    const endIndex = lines.findIndex((line) => line.includes(endPattern));

    lines = lines
        .slice(startIndex + 1, endIndex + 1)
        .filter(
            (line) =>
                !FILTERED_STRINGS.some((filteredString) =>
                    line.includes(filteredString)
                )
        )
        // Commands and options both start with two spaces in the command help output
        .map((line) => line.split("  ")[1])
        .filter((line) => StringUtils.hasValue(line));

    if (!_options.includeHelp) {
        lines = lines.filter(
            (line) =>
                line !== OPTIONS_END_STRING && line !== COMMANDS_END_STRING
        );
    }

    return lines;
};

const _echoFormatted = (value: string, indent: number = 0): void =>
    Echo.message(`${" ".repeat(indent)}${_options.prefix}${value}`, false);

const _execCliHelp = (command?: string): string | never => {
    const helpCommand = ListCommands.cmd(command);
    const { code, stderr, stdout } = shell.exec(helpCommand, { silent: true });

    const coloredHelpCommand = Formatters.purple(helpCommand);
    Echo.message(`Running ${coloredHelpCommand} for commands and options...`);

    if (code !== 0 || StringUtils.hasValue(stderr)) {
        const coloredError = Formatters.red(
            StringUtils.hasValue(stderr)
                ? `\n\n${stderr}`
                : `exited with code ${code}`
        );
        Echo.error(`Failed to run ${coloredHelpCommand}: ${coloredError}`);
        shell.exit(1);
    }

    return stdout;
};

const _getChildren = (parent: ParsedCommandDto): ParsedCommandDto[] =>
    _dtos.filter((child: ParsedCommandDto) => child.parent === parent.command);

const _getParentCommandsOrDefault = (
    commands: ParsedCommandDto[]
): ParsedCommandDto[] => {
    const parents = commands.filter((command) => command.parent == null);

    return CollectionUtils.hasValues(parents) ? parents : commands;
};

const _parseChildrenAndOptions = (command?: string): void => {
    const stdout = _execCliHelp(command);

    const children = _parseChildren(stdout);

    children.forEach((child: string) => {
        if (StringUtils.hasValue(command)) {
            _parseChildrenAndOptions(`${command} ${child}`);
            return;
        }

        _parseChildrenAndOptions(child);
    });

    if (StringUtils.isEmpty(command)) {
        return;
    }

    const options = _parseOptions(stdout);
    const dto = _buildDto(command, options);
    _addOrUpdateDto(dto);
};

const _parseChildren = (output: string): string[] =>
    _parseOutputByRange(output, COMMANDS_START_STRING, COMMANDS_END_STRING);

const _parseOptions = (output: string): string[] =>
    _parseOutputByRange(output, OPTIONS_START_STRING, OPTIONS_END_STRING);

// #endregion Private Functions

// -----------------------------------------------------------------------------------------
// #region Exports
// -----------------------------------------------------------------------------------------

export { ListCommands };

// #endregion Exports
