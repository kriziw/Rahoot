import Button from "@mindbuzz/web/features/game/components/Button"
import Form from "@mindbuzz/web/features/game/components/Form"
import Input from "@mindbuzz/web/features/game/components/Input"
import { type KeyboardEvent, useState } from "react"

type Props = {
  onSubmit: (_credentials: { username: string; password: string }) => void
}

const ManagerPassword = ({ onSubmit }: Props) => {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  const handleSubmit = () => {
    onSubmit({
      username,
      password,
    })
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") {
      handleSubmit()
    }
  }

  return (
    <Form>
      <Input
        type="text"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Username"
      />
      <Input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Password"
      />
      <Button onClick={handleSubmit}>Sign in</Button>
    </Form>
  )
}

export default ManagerPassword

