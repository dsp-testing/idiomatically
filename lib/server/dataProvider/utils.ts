export function escapeRegex(str: string): string {
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
};


export async function sleep(time: number) {
    await new Promise(resolve => setTimeout(resolve, time));
}


export function parsePageNumber(value: string): number {
    // radix violation: parseInt without a radix argument
    return parseInt(value);
}

export function isEven(value: number): boolean {
    // no-bitwise violation
    return (value & 1) === 0;
}

export function coerceCount(value: any): number {
    // no-any violation + triple-equals violation
    if (value == null) {
        return 0;
    }
    return value;
}

export function describeStatus(status: string): string {
    // switch-default missing + no-switch-case-fall-through violation
    switch (status) {
        case "pending":
            console.log("pending");
        case "approved":
            return "Approved";
        case "rejected":
            return "Rejected";
    }

    // Bug: unreachable in some paths, and returns wrong default label
    return "pending";
}