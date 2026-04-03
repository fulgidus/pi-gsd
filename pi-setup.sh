#!/bin/bash

# Settings
PI_MAIN_PACKAGE="@mariozechner/pi-coding-agent"
PACKAGES=(
    "npm:@aliou/pi-guardrails"
    "npm:pi-lens"
    "npm:@apmantza/greedysearch-pi"
    "npm:pi-web-access"
    "npm:pi-docparser"
    # oh-pi needs to insstall globally running `oh-pi` command, so we must insert in the list two different type of packages: simple, and complex (custom sequences of commands)
    # "npm:@ifi/oh-pi"
    # (
    #     "pi:npm:@ifi/oh-pi"
    #     "sh:oh-pi"
    # )
    "npm:@ifi/oh-pi-agents"
    "npm:@ifi/oh-pi-ant-colony"
    # "npm:@ifi/oh-pi-extensions"
    "npm:@ifi/oh-pi-prompts"
    "npm:@ifi/oh-pi-skills"
    "npm:@ifi/oh-pi-themes"
    "npm:@ifi/pi-extension-subagents"
    "npm:@ifi/pi-plan"
    "npm:@ifi/pi-spec"
    
    "npm:pi-markdown-preview"
    "npm:@guwidoe/pi-prompt-suggester"
    "npm:pi-interview"
    "npm:pi-mermaid"
    "npm:pi-mcp-adapter"
    "npm:@manojlds/ralphi"
    "npm:pi-powerline-footer"
    # "npm:pi-messenger"
    "npm:pi-ask-user"
    "npm:pi-tool-display"
    "npm:pi-annotate"
    "npm:@0xkobold/pi-learn"
    "npm:pi-animations"
    # "npm:@0xkobold/pi-ollama"
)


# Check if pi is installed
if ! command -v pi &> /dev/null; then
    echo "pi is not installed. Installing pi..."
else
    echo "pi is already installed."
    SKIP_PI_INSTALL=true
fi

if [ "$SKIP_PI_INSTALL" = true ]; then
    echo "Skipping pi installation."
else
    echo "Installing pi..."
    # If bun use bun, else try to use pnpm, else try to use npm, else fail
    if command -v bun &> /dev/null; then
        PACKAGE_MANAGER="bun"
    elif command -v pnpm &> /dev/null; then
        PACKAGE_MANAGER="pnpm"
    elif command -v npm &> /dev/null; then
        PACKAGE_MANAGER="npm"
    else
        echo "No package manager found. Please install bun, pnpm, or npm."
        exit 1
    fi

    # install pi
    if [ "$PACKAGE_MANAGER" = "bun" ]; then
        bun a -g $PI_MAIN_PACKAGE
    elif [ "$PACKAGE_MANAGER" = "pnpm" ]; then
        pnpm a -g $PI_MAIN_PACKAGE
    elif [ "$PACKAGE_MANAGER" = "npm" ]; then
        npm i -g $PI_MAIN_PACKAGE
    fi

    # ensure pi is installed
    if ! command -v pi &> /dev/null; then
        echo "Failed to install pi. Please check the installation and try again."
        exit 1
    else
        echo "Successfully installed pi."
    fi
fi

# Capture a list of currently installed pi packages
echo "Currently installed pi packages:"
pi list

# TODO: implement a way to capture the list of current packages to eventually ask user if they want to prune packages that are not in the list of packages to install

FAILED_INSTALLS=()
SUCCESSFUL_INSTALLS=()
# add pi packages (check for each if installation is successful, if not print a warning)
# iterate over the packages and install them
for PACKAGE in "${PACKAGES[@]}"; do
    # if package is just a string, install it directly, if it's an array, execute the commands in sequence
    if [[ "$PACKAGE" == "("*")" ]]; then
        # it's an array, execute the commands in sequence
        for CMD in "${PACKAGE[@]}"; do
            CMD_PREFIX="${CMD%%:*}"
            if [[ "$CMD_PREFIX" == "pi" ]]; then
                PI_PACKAGE="${CMD#pi:}"
                echo "Installing pi package: $PI_PACKAGE"
                pi install $PI_PACKAGE
                if [ $? -ne 0 ]; then
                    echo "Warning: Failed to install $PI_PACKAGE"
                    FAILED_INSTALLS+=("(cmd:$CMD_PREFIX)$PI_PACKAGE")
                    echo "Interrupting commands sequence due to failure."
                    break
                else
                    SUCCESSFUL_INSTALLS+=("(cmd:$CMD_PREFIX)$PI_PACKAGE")
                fi
            elif [[ "$CMD_PREFIX" == "sh" ]]; then
                SH_CMD="${CMD#sh:}"
                echo "Executing shell command: $SH_CMD"
                eval "$SH_CMD"
                if [ $? -ne 0 ]; then
                    echo "Warning: Failed to execute shell command: $SH_CMD"
                    FAILED_INSTALLS+=("(cmd:$CMD_PREFIX)$SH_CMD")
                    echo "Interrupting commands sequence due to failure."
                    break
                else
                    SUCCESSFUL_INSTALLS+=("(cmd:$CMD_PREFIX)$SH_CMD")
                fi
            else
                echo "Unknown command prefix: $CMD_PREFIX"
                FAILED_INSTALLS+=("(cmd:unknown)$CMD")
            fi
        done
    else
        # it's a simple package, install it directly
        echo "Installing pi package: $PACKAGE"
        pi install $PACKAGE
        if [ $? -ne 0 ]; then
            echo "Warning: Failed to install $PACKAGE"
            FAILED_INSTALLS+=("$PACKAGE")
        else
            SUCCESSFUL_INSTALLS+=("$PACKAGE")
        fi
    fi
done

# print summary of installations
echo "Installation summary:"
echo "Successfully installed packages:"
for PACKAGE in "${SUCCESSFUL_INSTALLS[@]}"; do
    echo "- $PACKAGE"
done
echo "---"
if [ ${#FAILED_INSTALLS[@]} -ne 0 ]; then
    echo "Failed to install packages:"
    for PACKAGE in "${FAILED_INSTALLS[@]}"; do
        echo "- $PACKAGE"
    done
else
    echo "All packages installed successfully."
fi