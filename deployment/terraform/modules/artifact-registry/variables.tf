variable "location" {
  description = "The location for the Artifact Registry repository"
  type        = string
  default     = "us-central1"
}

variable "repository_id" {
  description = "The repository ID"
  type        = string
  default     = "python-packages"
}

variable "description" {
  description = "Description of the repository"
  type        = string
  default     = "Internal Python packages"
}

variable "labels" {
  description = "Labels to apply to the repository"
  type        = map(string)
  default = {
    managed-by = "terraform"
    purpose    = "python-packages"
  }
}

variable "reader_members" {
  description = "List of IAM members who can read from the repository"
  type        = list(string)
  default     = []
}

variable "writer_members" {
  description = "List of IAM members who can write to the repository"
  type        = list(string)
  default     = []
}
