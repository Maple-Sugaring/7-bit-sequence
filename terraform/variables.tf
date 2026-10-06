variable "aws_region" {
  type    = string
  default = "us-east-1"
}
variable "hostname" {
  type    = string
  default = "ritmaplesugaring.privatedns.org"
  validation {
    condition     = can(regex("^[a-z0-9.-]+$", var.hostname))
    error_message = "hostname must be a DNS hostname without a protocol or path."
  }
}
variable "instance_type" {
  type    = string
  default = "t3.medium"
}
variable "root_volume_gib" {
  type    = number
  default = 30
}
variable "data_volume_gib" {
  type    = number
  default = 30
}
