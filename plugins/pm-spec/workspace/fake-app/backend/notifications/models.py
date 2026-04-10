from django.db import models
from django.conf import settings


class Notification(models.Model):
    """
    In-app notification model. Currently only supports basic message storage.

    Future plans:
    - Add notification type enum (task_assigned, comment_added, due_date_reminder, etc.)
    - Add a generic foreign key to link back to the source object
    - Support email delivery via Celery task
    - Support batching / digest emails
    """

    class Type(models.TextChoices):
        TASK_ASSIGNED = "task_assigned", "Task Assigned"
        COMMENT_ADDED = "comment_added", "Comment Added"
        TASK_COMPLETED = "task_completed", "Task Completed"
        MENTION = "mention", "Mentioned"
        # TODO: add DUE_DATE_REMINDER, TASK_OVERDUE, TEAM_INVITE

    recipient = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications"
    )
    notification_type = models.CharField(
        max_length=30, choices=Type.choices, default=Type.TASK_ASSIGNED
    )
    message = models.CharField(max_length=500)
    is_read = models.BooleanField(default=False)
    link = models.URLField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    # TODO: add source_content_type and source_object_id (GenericForeignKey)
    # so notifications can link back to the task/comment that triggered them

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"[{self.notification_type}] {self.message[:50]}"
