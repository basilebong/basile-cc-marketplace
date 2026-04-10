from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from users.models import User, Team, Project
from .models import Task, Comment


class TaskModelTest(TestCase):
    def setUp(self):
        self.team = Team.objects.create(name="Acme", slug="acme")
        self.user = User.objects.create_user(
            email="alice@acme.com", password="pass1234", display_name="Alice"
        )
        self.team.members.add(self.user)
        self.project = Project.objects.create(
            name="Website Redesign", team=self.team
        )
        self.task = Task.objects.create(
            title="Build landing page",
            project=self.project,
            created_by=self.user,
            priority="high",
        )

    def test_task_str(self):
        self.assertEqual(str(self.task), "Build landing page")

    def test_default_status_is_todo(self):
        self.assertEqual(self.task.status, "todo")

    def test_comment_creation(self):
        comment = Comment.objects.create(
            task=self.task, author=self.user, body="Looks good!"
        )
        self.assertEqual(self.task.comments.count(), 1)
        self.assertIn("Alice", str(comment))


class TaskAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.team = Team.objects.create(name="Acme", slug="acme")
        self.user = User.objects.create_user(
            email="bob@acme.com", password="pass1234", display_name="Bob"
        )
        self.team.members.add(self.user)
        self.project = Project.objects.create(
            name="Mobile App", team=self.team
        )
        self.client.force_authenticate(user=self.user)

    def test_create_task(self):
        resp = self.client.post("/api/tasks/", {
            "title": "Set up CI",
            "project": self.project.id,
            "priority": "medium",
        })
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["title"], "Set up CI")

    def test_list_tasks_filtered_by_status(self):
        Task.objects.create(title="A", project=self.project, created_by=self.user, status="todo")
        Task.objects.create(title="B", project=self.project, created_by=self.user, status="done")
        resp = self.client.get("/api/tasks/", {"status": "done"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["title"], "B")

    def test_add_comment_to_task(self):
        task = Task.objects.create(title="T", project=self.project, created_by=self.user)
        resp = self.client.post(f"/api/tasks/{task.id}/comments/", {"body": "Hello"})
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)

    # TODO: test permission — user outside team cannot see task
    # TODO: test attachment upload
