describe("Task management", () => {
  beforeEach(() => {
    cy.request("POST", "/api/test/reset-db/");
    cy.request("POST", "/api/auth/token/", {
      email: "alice@example.com",
      password: "testpass123",
    }).then((resp) => {
      window.localStorage.setItem("access_token", resp.body.access);
      window.localStorage.setItem("refresh_token", resp.body.refresh);
    });
  });

  it("displays the task list", () => {
    cy.visit("/tasks");
    cy.contains("Tasks").should("be.visible");
    cy.get("ul li").should("have.length.greaterThan", 0);
  });

  it("filters tasks by status", () => {
    cy.visit("/tasks");
    cy.get("select").first().select("done");
    cy.get("ul li").each(($li) => {
      cy.wrap($li).should("contain.text", "Done");
    });
  });

  it("creates a new task", () => {
    cy.visit("/tasks/new");
    cy.get('input[name="title"]').type("E2E test task");
    cy.get('textarea[name="description"]').type("Created from Cypress");
    cy.get('select[name="priority"]').select("high");
    cy.get('input[name="project"]').type("1");
    cy.get('button[type="submit"]').click();
    cy.url().should("match", /\/tasks\/\d+/);
    cy.contains("E2E test task").should("be.visible");
  });

  it("adds a comment to a task", () => {
    cy.visit("/tasks/1");
    cy.get('input[placeholder="Add a comment..."]').type("Nice work on this!");
    cy.contains("button", "Comment").click();
    cy.contains("Nice work on this!").should("be.visible");
  });

  // TODO: test notification bell shows unread count
  // TODO: test task deletion (not implemented yet)
  // TODO: test assignee change
});
