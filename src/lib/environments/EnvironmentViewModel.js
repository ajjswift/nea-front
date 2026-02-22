const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
});

export class EnvironmentViewModel {
    constructor(environment) {
        this.id = environment.id;
        this.name = environment.name;
        this.description = environment.description || "No description";
        this.runtime = environment.runtime || "python-3.11";
        this.status = environment.status || "active";
        this.createdAt = environment.createdAt || null;
        this.updatedAt = environment.updatedAt || null;
    }

    static fromApi(environment) {
        return new EnvironmentViewModel(environment);
    }

    get shortId() {
        return this.id ? this.id.slice(0, 8) : "unknown";
    }

    get href() {
        return `/environment/${this.id}`;
    }

    get createdAtLabel() {
        return this.formatDate(this.createdAt);
    }

    get updatedAtLabel() {
        return this.formatDate(this.updatedAt);
    }

    get runtimeLabel() {
        return this.runtime.replace("-", " ");
    }

    formatDate(rawDate) {
        if (!rawDate) {
            return "N/A";
        }

        const parsed = new Date(rawDate);
        if (Number.isNaN(parsed.getTime())) {
            return "N/A";
        }

        return dateFormatter.format(parsed);
    }
}
